package handlers

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"patternapp/backend/cutplan"
)

func planAPI(t *testing.T) *OrdersAPI {
	t.Helper()
	api, err := NewOrdersAPI(t.TempDir() + "/orders.json")
	if err != nil {
		t.Fatal(err)
	}
	return api
}

func doJSON(h http.HandlerFunc, method, path, body string, id string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.SetPathValue("id", id)
	rec := httptest.NewRecorder()
	h(rec, req)
	return rec
}

const shirtOrderBody = `{"customerName":"SDN 1","garmentType":"school_shirt","sizes":[
 {"label":"S","quantity":12,"measurements":{"bust":84,"waist":70,"backWaistLength":39,"shoulder":12,"neck":35,"sleeveLength":56,"upperArm":26,"wrist":16}},
 {"label":"M","quantity":18,"measurements":{"bust":92,"waist":78,"backWaistLength":41,"shoulder":13,"neck":37,"sleeveLength":59,"upperArm":29,"wrist":17}}]}`

func TestCuttingPlanEndToEnd(t *testing.T) {
	api := planAPI(t)
	if rec := doJSON(api.List, http.MethodPost, "/api/orders", shirtOrderBody, ""); rec.Code != http.StatusCreated {
		t.Fatalf("create: %d %s", rec.Code, rec.Body)
	}

	// Nothing to plan from until a mockup exists.
	rec := doJSON(api.CuttingPlan, http.MethodPost, "/x", `{}`, "1")
	if rec.Code != http.StatusUnprocessableEntity || !strings.Contains(rec.Body.String(), "mockup") {
		t.Errorf("before a mockup: %d %q", rec.Code, rec.Body)
	}

	if rec := doJSON(api.CreateMockup, http.MethodPost, "/x", `{"sleeveStyle":"half","collar":true}`, "1"); rec.Code != http.StatusCreated {
		t.Fatalf("mockup: %d %s", rec.Code, rec.Body)
	}
	rec = doJSON(api.CuttingPlan, http.MethodPost, "/x", `{"fabricWidth":150,"maxPlies":20,"compareWidths":[110,150]}`, "1")
	if rec.Code != http.StatusOK {
		t.Fatalf("plan: %d %s", rec.Code, rec.Body)
	}
	var resp cuttingPlanResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatal(err)
	}
	if resp.Version != 1 || len(resp.Plans) != 1 || resp.Plans[0].Fabric != "main" {
		t.Fatalf("unexpected response: version %d, %d plans", resp.Version, len(resp.Plans))
	}
	plan := resp.Plans[0]
	if plan.Garments != 30 || !plan.Complete || plan.Meters <= 0 || len(plan.Lays) == 0 {
		t.Errorf("bad plan: %+v", plan)
	}
	if len(plan.Lays[0].Marker.Placed) == 0 {
		t.Error("a lay should carry its marker to draw")
	}
	if len(resp.Widths) != 2 {
		t.Errorf("wanted a result per compared width, got %d", len(resp.Widths))
	}
	if len(resp.Sizes) != 2 || resp.Sizes[0] != (cutplan.SizeCount{Size: "S", Count: 12}) {
		t.Errorf("sizes = %+v", resp.Sizes)
	}
}

func TestCuttingPlanRefusesBadInput(t *testing.T) {
	api := planAPI(t)
	doJSON(api.List, http.MethodPost, "/api/orders", shirtOrderBody, "")
	doJSON(api.CreateMockup, http.MethodPost, "/x", `{"sleeveStyle":"half"}`, "1")

	for name, body := range map[string]string{
		"huge width":   `{"fabricWidth":99999}`,
		"tiny width":   `{"fabricWidth":2}`,
		"many plies":   `{"maxPlies":100000}`,
		"neg shrink":   `{"shrinkLength":-3}`,
		"wild reserve": `{"reservePercent":900}`,
		"too many cmp": `{"compareWidths":[100,101,102,103,104,105,106,107,108]}`,
		"not json":     `{oops`,
	} {
		if rec := doJSON(api.CuttingPlan, http.MethodPost, "/x", body, "1"); rec.Code != http.StatusBadRequest {
			t.Errorf("%s: %d %q", name, rec.Code, rec.Body)
		}
	}
	if rec := doJSON(api.CuttingPlan, http.MethodGet, "/x", "", "1"); rec.Code != http.StatusMethodNotAllowed {
		t.Errorf("GET: %d", rec.Code)
	}
	if rec := doJSON(api.CuttingPlan, http.MethodPost, "/x", `{}`, "999"); rec.Code != http.StatusNotFound {
		t.Errorf("missing order: %d", rec.Code)
	}
	if rec := doJSON(api.CuttingPlan, http.MethodPost, "/x", `{"version":9}`, "1"); rec.Code != http.StatusNotFound {
		t.Errorf("missing revision: %d", rec.Code)
	}
}

func TestCuttingPlanNeedsQuantities(t *testing.T) {
	api := planAPI(t)
	body := strings.ReplaceAll(shirtOrderBody, `"quantity":12`, `"quantity":0`)
	body = strings.ReplaceAll(body, `"quantity":18`, `"quantity":0`)
	doJSON(api.List, http.MethodPost, "/api/orders", body, "")
	doJSON(api.CreateMockup, http.MethodPost, "/x", `{"sleeveStyle":"half"}`, "1")
	rec := doJSON(api.CuttingPlan, http.MethodPost, "/x", `{}`, "1")
	if rec.Code != http.StatusUnprocessableEntity || !strings.Contains(rec.Body.String(), "size chart") {
		t.Errorf("%d %q", rec.Code, rec.Body)
	}
}
