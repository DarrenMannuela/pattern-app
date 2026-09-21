// Package vision reads a photo of a uniform and describes it in the terms of
// the pattern maker's catalog (collar, sleeves, front, panels, pockets...), so
// the maker can be filled in from a picture. The photo is read by the Claude
// API (ANTHROPIC_API_KEY) or by a vision model running locally under Ollama, so
// no key is needed; see Service.
package vision

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/anthropics/anthropic-sdk-go"
	"github.com/anthropics/anthropic-sdk-go/option"
	"github.com/anthropics/anthropic-sdk-go/shared/constant"
)

// Model reads the photo. The most capable widely available model: reading a
// garment's construction from a photo is fine detail work.
const Model = "claude-opus-5"

// PocketRead is a pocket the model sees.
type PocketRead struct {
	Segment string `json:"segment"`
	Kind    string `json:"kind"`
}

// PrintRead is an embroidery or print the model sees.
type PrintRead struct {
	Type        string `json:"type"`
	Segment     string `json:"segment"`
	Description string `json:"description"`
}

// Design is what the model reads off the photo. Every value is one the pattern
// maker knows ("not_applicable" or "none" where a choice doesn't apply).
type Design struct {
	Garment     string       `json:"garment"`
	Fit         string       `json:"fit"`
	Sleeve      string       `json:"sleeve"`
	Neckline    string       `json:"neckline"`
	Front       string       `json:"front"`
	Back        string       `json:"back"`
	Hem         string       `json:"hem"`
	Trim        string       `json:"trim"`
	InsertPanel string       `json:"insert_panel"`
	Leg         string       `json:"leg"`
	FrontPocket string       `json:"front_pocket"`
	BackPocket  string       `json:"back_pocket"`
	Waist       string       `json:"waist"`
	SideStripe  string       `json:"side_stripe"`
	SkirtStyle  string       `json:"skirt_style"`
	Motifs      []string     `json:"motifs"`
	Pattern     string       `json:"pattern"`
	Pockets     []PocketRead `json:"pockets"`
	Prints      []PrintRead  `json:"prints"`
	MainColor   string       `json:"main_color"`
	AccentColor string       `json:"accent_color"`
	Unsupported []string     `json:"unsupported"`
	Summary     string       `json:"summary"`
	Confidence  string       `json:"confidence"`
	// Provider and Model say who read the photo ("anthropic" or "ollama").
	Provider string `json:"provider,omitempty"`
	Model    string `json:"model,omitempty"`
}

func strEnum(vals ...string) map[string]any {
	enum := make([]any, len(vals))
	for i, v := range vals {
		enum[i] = v
	}
	return map[string]any{"type": "string", "enum": enum}
}

var segments = []string{"collar", "cuffs", "left_chest", "right_chest", "center_front", "back", "left_sleeve", "right_sleeve", "left_leg", "right_leg", "waistband", "hem"}

// Schema is the JSON schema of Design, for structured outputs.
func Schema() map[string]any {
	obj := func(props map[string]any) map[string]any {
		req := make([]any, 0, len(props))
		for k := range props {
			req = append(req, k)
		}
		return map[string]any{"type": "object", "properties": props, "required": req, "additionalProperties": false}
	}
	return obj(map[string]any{
		"garment":      strEnum("shirt", "polo", "pants", "shorts", "skirt", "other"),
		"fit":          strEnum("unisex", "male", "female"),
		"sleeve":       strEnum("short", "three_quarter", "long", "sleeveless", "not_applicable"),
		"neckline":     strEnum("point_collar", "spread_collar", "peter_pan_collar", "band_collar", "polo_collar", "v_neck", "round_neck", "not_applicable"),
		"front":        strEnum("placket", "half_placket", "hidden_placket", "plain", "not_applicable"),
		"back":         strEnum("yoke", "plain", "not_applicable"),
		"hem":          strEnum("curved", "straight", "not_applicable"),
		"trim":         strEnum("none", "contrast_trim"),
		"insert_panel": strEnum("none", "side_panel"),
		"leg":          strEnum("slim", "straight", "wide", "not_applicable"),
		"front_pocket": strEnum("slant", "none", "not_applicable"),
		"back_pocket":  strEnum("welt", "patch", "none", "not_applicable"),
		"waist":        strEnum("band", "elastic", "not_applicable"),
		"side_stripe":  strEnum("none", "side_stripe"),
		"skirt_style":  strEnum("straight", "a_line", "flared", "not_applicable"),
		"motifs":       map[string]any{"type": "array", "items": strEnum("centre_streak", "double_streak", "chest_band", "shoulder_band", "hem_band", "arm_bands")},
		"pattern":      strEnum("solid", "stripes", "batik", "parang", "chevron", "dots", "check"),
		"pockets": map[string]any{"type": "array", "items": obj(map[string]any{
			"segment": strEnum(segments...),
			"kind":    strEnum("patch", "pen", "welt"),
		})},
		"prints": map[string]any{"type": "array", "items": obj(map[string]any{
			"type":        strEnum("embroidery", "sablon"),
			"segment":     strEnum(segments...),
			"description": map[string]any{"type": "string"},
		})},
		"main_color":   map[string]any{"type": "string"},
		"accent_color": map[string]any{"type": "string"},
		"unsupported":  map[string]any{"type": "array", "items": map[string]any{"type": "string"}},
		"summary":      map[string]any{"type": "string"},
		"confidence":   strEnum("low", "medium", "high"),
	})
}

const systemPrompt = `You read photographs of uniforms for a garment maker's pattern software. The software builds a pattern from a fixed catalog of parts, and you say which catalog part matches what you see.

Describe the garment as worn by the person (or as laid out), from the customer's point of view. Rules:
- garment: shirt (any woven top: dress shirt, blouse, tunic, chef or restaurant shirt), polo (knit polo), pants, shorts, skirt, or other.
- sleeve: short, three_quarter or long from the arms you can see; if the garment is on a stand or folded, judge from the visible sleeve. Never leave it not_applicable on a shirt.
- fit: female if it is tailored for a woman (shaped at the waist, darts or princess seams), male if cut broad and boxy for a man, otherwise unisex.
- neckline: a turn-down collar with a stand is point_collar (narrow points), spread_collar (wide points) or peter_pan_collar (flat rounded); band_collar is a standing collar with no fold-over (mandarin, koko, chef); v_neck and round_neck are collarless necklines; polo_collar is a knit polo collar.
- front: placket (visible row of buttons the whole way down), half_placket (buttons only part-way down, as on a polo shirt, which has a short placket at the neck), hidden_placket (a concealed closure, no visible buttons), plain (no opening).
- trim: contrast_trim when the collar or neckline edge has a piping, binding or stripe in a colour different from the garment (for example a red-striped polo collar, red piping round a collar, or a white binding round a grey V-neck). A collar the same colour as the rest of the garment is none.
- insert_panel: side_panel when a strip of a visibly different colour, fabric or print (for example a batik strip) runs from the shoulder to the hem on the front. If the front is all one colour it is none; buttons, a placket, pockets and a collar are not a panel.
- waist (pants, shorts): band is a fitted waistband with belt loops and a fly; elastic is a pull-on with an elastic or drawstring waist. side_stripe: a stripe or a panel of a different colour down the outer side of the legs (three white stripes, a curved side panel); none if the legs are one colour.
- motifs: decorative bands of a different or patterned fabric (other than an insert_panel): centre_streak is one band down the center front from the collar to the hem, double_streak two bands down the front, chest_band a band across the chest, shoulder_band a band across the shoulders, hem_band a border at the hem, arm_bands bands round the arms. List each you can see; if none, leave the list empty. pattern is what the motif bands (and any insert panel) are printed or woven with: solid (one plain colour), stripes, batik (diamond or floral batik), parang (diagonal batik), chevron (zigzag or tumpal triangles), dots or check.
- pockets: each patch pocket, pen pocket (slim) or welt pocket you can clearly see, on the segment it sits on (a pocket on the chest is left_chest or right_chest; pockets on sleeves are rare). prints: each embroidery or screen print (logo, name, text) you can clearly see, on the segment it sits on, with a short description. If in doubt, leave pockets and prints empty. Left and right are the wearer's.
- main_color and accent_color are #rrggbb hex values of the main fabric and the contrast fabric or trim.
- Use not_applicable for choices that don't apply to the garment (for example sleeve on a skirt).
- unsupported: list, in plain words, every visible design detail that none of the catalog parts can produce (drop shoulders, side vents, ruffles, contrast cuffs, patterned fabric, and so on). Do not list what you mapped.
- summary: one or two sentences describing the garment. confidence: how sure you are of the mapping overall.`

// Analyzer reads photos with the Claude API.
type Analyzer struct {
	client anthropic.Client
}

// NewAnalyzer builds an analyzer; opts are extra client options (a base URL
// for tests, say). Credentials come from the environment.
func NewAnalyzer(opts ...option.RequestOption) *Analyzer {
	return &Analyzer{client: anthropic.NewClient(opts...)}
}

// Analyze describes the garment in an image (JPEG, PNG, GIF or WebP bytes).
func (a *Analyzer) Analyze(ctx context.Context, img []byte, mediaType string) (*Design, error) {
	switch mediaType {
	case "image/jpeg", "image/png", "image/gif", "image/webp":
	default:
		return nil, fmt.Errorf("unsupported picture type %q (use JPEG, PNG, GIF or WebP)", mediaType)
	}
	msg, err := a.client.Beta.Messages.New(ctx, anthropic.BetaMessageNewParams{
		Model:     Model,
		MaxTokens: 4000,
		Betas:     []anthropic.AnthropicBeta{anthropic.AnthropicBetaServerSideFallback2026_07_01},
		// If the model declines for a policy reason the request is retried on
		// the default fallback model instead of failing.
		Fallbacks: anthropic.BetaFallbacksParamUnion{OfDefault: constant.ValueOf[constant.Default]()},
		System:    []anthropic.BetaTextBlockParam{{Text: systemPrompt}},
		OutputConfig: anthropic.BetaOutputConfigParam{
			Format: anthropic.BetaJSONOutputFormatParam{Schema: Schema()},
		},
		Messages: []anthropic.BetaMessageParam{
			anthropic.NewBetaUserMessage(
				anthropic.NewBetaImageBlock(anthropic.BetaBase64ImageSourceParam{
					Data:      base64.StdEncoding.EncodeToString(img),
					MediaType: anthropic.BetaBase64ImageSourceMediaType(mediaType),
				}),
				anthropic.NewBetaTextBlock("Describe this uniform in the catalog's terms."),
			),
		},
	})
	if err != nil {
		return nil, err
	}
	if msg.StopReason == anthropic.BetaStopReasonRefusal {
		return nil, errors.New("the model declined to describe this picture")
	}
	if msg.StopReason == anthropic.BetaStopReasonMaxTokens {
		return nil, errors.New("the description was cut off; try again")
	}
	var text strings.Builder
	for _, block := range msg.Content {
		if t, ok := block.AsAny().(anthropic.BetaTextBlock); ok {
			text.WriteString(t.Text)
		}
	}
	var d Design
	if err := json.Unmarshal([]byte(text.String()), &d); err != nil {
		return nil, fmt.Errorf("couldn't read the model's answer: %w", err)
	}
	d.Provider, d.Model = "anthropic", Model
	return &d, nil
}
