package catalog

import "testing"

// Every SAI fabric has its roll size for the cutting layout, and the ones a
// seller lists are marked so.
func TestSAIFabricsHaveRollSizes(t *testing.T) {
	listed := 0
	for _, f := range Fabrics {
		if f.Brand == "" {
			continue
		}
		if f.WidthCm != 150 || f.RollYards != 30 {
			t.Errorf("%s %s: roll %v cm x %v yd", f.Brand, f.Name, f.WidthCm, f.RollYards)
		}
		if f.WidthListed {
			listed++
		}
	}
	if listed != len(saiWidthListed) {
		t.Errorf("%d fabrics marked listed, want %d (a name in saiWidthListed doesn't match)", listed, len(saiWidthListed))
	}
}
