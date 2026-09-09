// Package grading turns one drafted sample size into a full adult
// size run, by applying standard grade increments to the base body
// measurements before handing each size's measurements back to the
// draft package. It's pure arithmetic (fixed cm delta per size step)
// — the same "grade rule" a patternmaker would keep on an index card
// and apply by hand, just automated so every size in the run stays
// consistent and doesn't need re-drafting from scratch.
//
// IMPORTANT: the deltas in DefaultAdultGradeRule are typical
// ready-to-wear/uniform grading increments, not a fitted grade rule
// for any specific body type or garment. Treat a generated size run
// as a strong starting point — spot-check S and XL against a real
// fit before cutting a full production order.
package grading

import (
	"fmt"

	"patternapp/backend/draft"
)

// StandardAdultSizes is the default adult size run, smallest to
// largest. Order matters: grading steps are counted along this list.
var StandardAdultSizes = []string{"S", "M", "L", "XL", "XXL", "XXXL"}

// GradeRule is the additive change applied to each measurement per
// single size step (e.g. S->M is one step, S->L is two steps).
type GradeRule struct {
	Bust            float64 `json:"bust"`
	Waist           float64 `json:"waist"`
	Shoulder        float64 `json:"shoulder"`
	Neck            float64 `json:"neck"`
	BackWaistLength float64 `json:"backWaistLength"`
}

// DefaultAdultGradeRule is a standard adult uniform/ready-to-wear
// grade: chest and waist grow 4cm per size step, shoulder and neck
// 1cm, and torso length 1.5cm — the increments commonly used for
// men's/unisex woven-shirt size runs. Override it if your supplier
// or spec sheet uses a different grade.
var DefaultAdultGradeRule = GradeRule{
	Bust:            4,
	Waist:           4,
	Shoulder:        1,
	Neck:            1,
	BackWaistLength: 1.5,
}

func sizeIndex(sizes []string, label string) int {
	for i, s := range sizes {
		if s == label {
			return i
		}
	}
	return -1
}

// GradeMeasurements derives the measurements for each size in
// wantSizes from base (anchored at baseSize), by applying rule scaled
// by how many steps away each target size is along sizeOrder. base is
// filled in with draft.Defaults first, so a caller can supply only
// the measurements they know and still get a sensible full run.
func GradeMeasurements(base draft.Measurements, sizeOrder []string, baseSize string, rule GradeRule, wantSizes []string) (map[string]draft.Measurements, error) {
	base = draft.Defaults(base)

	bi := sizeIndex(sizeOrder, baseSize)
	if bi == -1 {
		return nil, fmt.Errorf("unknown base size %q", baseSize)
	}

	out := make(map[string]draft.Measurements, len(wantSizes))
	for _, sz := range wantSizes {
		si := sizeIndex(sizeOrder, sz)
		if si == -1 {
			return nil, fmt.Errorf("unknown size %q", sz)
		}
		steps := float64(si - bi)
		m := base
		m.Bust += steps * rule.Bust
		m.Waist += steps * rule.Waist
		m.Shoulder += steps * rule.Shoulder
		m.Neck += steps * rule.Neck
		m.BackWaistLength += steps * rule.BackWaistLength
		out[sz] = m
	}
	return out, nil
}
