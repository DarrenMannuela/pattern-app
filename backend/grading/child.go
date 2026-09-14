// Children's grading is age-based, not letter-sized (S/M/L don't map
// meaningfully onto a 6-year-old vs a 12-year-old), and growth per
// year of age is a different — and generally smaller relative to
// overall size — increment than an adult ready-to-wear size step.
// The underlying math (GradeMeasurements) is identical to the adult
// path; only the base measurements, the increments, and the size
// labels change.
package grading

import "patternapp/backend/draft"

// StandardChildSizes covers the common elementary-school uniform age
// range. Narrower or wider than your actual order range? Pass your
// own age list to GradeChildMeasurements's wantSizes — the increments
// still apply per year of age either way.
var StandardChildSizes = []string{"6", "7", "8", "9", "10", "11", "12"}

// DefaultChildGradeRule is a standard per-age-year increment for
// children's wear, derived from typical growth-chart proportions
// across ages 6-12: chest and waist grow more slowly than an adult
// ready-to-wear step, torso length grows faster relative to chest
// than it does in adult grading (children's limbs and torso lengthen
// noticeably faster than they broaden at this age). Spot-check
// against your own size chart before cutting a full run — like the
// adult rule, this is a standard starting point, not a fitted grade
// for any specific supplier's chart.
var DefaultChildGradeRule = GradeRule{
	Bust:            2.0,
	Waist:           1.5,
	Shoulder:        0.4,
	Neck:            0.5,
	BackWaistLength: 1.3,
	SleeveLength:    1.5,
	UpperArm:        0.8,
	Wrist:           0.3,
}

// DefaultChildBase anchors the child grade rule at age 8 — roughly
// the midpoint of StandardChildSizes, so grading up to 12 and down to
// 6 both stay within a couple of steps of the anchor.
var DefaultChildBase = draft.Measurements{
	Bust: 60, Waist: 56, BackWaistLength: 28.7,
	Shoulder: 9.8, Neck: 29, Ease: 10,
	SleeveLength: 38, UpperArm: 21, Wrist: 13,
}

// GradeChildMeasurements grades base (any zero field filled from
// DefaultChildBase, not the adult defaults draft.Defaults would use)
// across wantSizes, anchored at baseSize within sizeOrder.
func GradeChildMeasurements(base draft.Measurements, sizeOrder []string, baseSize string, wantSizes []string) (map[string]draft.Measurements, error) {
	filled := fillChildDefaults(base)
	return GradeMeasurements(filled, sizeOrder, baseSize, DefaultChildGradeRule, wantSizes)
}

// fillChildDefaults fills any zero field in m with DefaultChildBase's
// value. GradeMeasurements calls draft.Defaults internally too, but
// that only touches fields still at zero — so filling child-
// appropriate values here first means the adult fallback never fires.
func fillChildDefaults(m draft.Measurements) draft.Measurements {
	if m.Bust == 0 {
		m.Bust = DefaultChildBase.Bust
	}
	if m.Waist == 0 {
		m.Waist = DefaultChildBase.Waist
	}
	if m.BackWaistLength == 0 {
		m.BackWaistLength = DefaultChildBase.BackWaistLength
	}
	if m.Shoulder == 0 {
		m.Shoulder = DefaultChildBase.Shoulder
	}
	if m.Neck == 0 {
		m.Neck = DefaultChildBase.Neck
	}
	if m.Ease == 0 {
		m.Ease = DefaultChildBase.Ease
	}
	if m.SleeveLength == 0 {
		m.SleeveLength = DefaultChildBase.SleeveLength
	}
	if m.UpperArm == 0 {
		m.UpperArm = DefaultChildBase.UpperArm
	}
	if m.Wrist == 0 {
		m.Wrist = DefaultChildBase.Wrist
	}
	return m
}
