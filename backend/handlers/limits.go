package handlers

import (
	"fmt"
	"math"
	"reflect"
	"strings"

	"patternapp/backend/draft"
	"patternapp/backend/orders"
)

// The drafter's work grows with the size of the numbers it is given: a bust of
// 1,000,000,000 cm keeps a request running for minutes. These bounds are far
// beyond any real garment, so they only ever stop a typo or a bad payload.
const (
	maxMeasurementCm = 500
	maxOptionValue   = 1000
	maxQuantity      = 100000
)

// checkMeasurements returns what is wrong with a set of body measurements
// (centimetres), or "".
func checkMeasurements(m draft.Measurements) string {
	v := reflect.ValueOf(m)
	for i := 0; i < v.NumField(); i++ {
		if x := v.Field(i).Float(); math.IsNaN(x) || x < 0 || x > maxMeasurementCm {
			name, _, _ := strings.Cut(v.Type().Field(i).Tag.Get("json"), ",")
			return fmt.Sprintf("%s must be between 0 and %d cm", name, maxMeasurementCm)
		}
	}
	return ""
}

// checkSizes checks every row of a size chart.
func checkSizes(sizes []orders.OrderSize) string {
	for _, sz := range sizes {
		if msg := checkMeasurements(sz.Measurements); msg != "" {
			return fmt.Sprintf("size %q: %s", sz.Label, msg)
		}
		if sz.Quantity < 0 || sz.Quantity > maxQuantity {
			return fmt.Sprintf("size %q: quantity must be between 0 and %d", sz.Label, maxQuantity)
		}
	}
	return ""
}

// checkNumbers walks a decoded request and returns a message for the first
// number outside what any garment option could need, or "". It covers the
// option structs (pocket sizes, custom widths, accessory positions) without
// each one needing its own check.
func checkNumbers(v any) string {
	return walkNumbers(reflect.ValueOf(v), "")
}

func walkNumbers(v reflect.Value, path string) string {
	switch v.Kind() {
	case reflect.Pointer, reflect.Interface:
		if !v.IsNil() {
			return walkNumbers(v.Elem(), path)
		}
	case reflect.Float32, reflect.Float64:
		if x := v.Float(); math.IsNaN(x) || math.Abs(x) > maxOptionValue {
			return fmt.Sprintf("%s is out of range", strings.TrimPrefix(path, "."))
		}
	case reflect.Int, reflect.Int8, reflect.Int16, reflect.Int32, reflect.Int64:
		if x := v.Int(); x < -maxQuantity || x > maxQuantity {
			return fmt.Sprintf("%s is out of range", strings.TrimPrefix(path, "."))
		}
	case reflect.Struct:
		for i := 0; i < v.NumField(); i++ {
			f := v.Type().Field(i)
			if !f.IsExported() {
				continue
			}
			name, _, _ := strings.Cut(f.Tag.Get("json"), ",")
			if name == "" {
				name = f.Name
			}
			if msg := walkNumbers(v.Field(i), path+"."+name); msg != "" {
				return msg
			}
		}
	case reflect.Slice, reflect.Array:
		if v.Type().Elem().Kind() == reflect.Uint8 { // raw bytes, not numbers to bound
			return ""
		}
		for i := 0; i < v.Len(); i++ {
			if msg := walkNumbers(v.Index(i), fmt.Sprintf("%s[%d]", path, i)); msg != "" {
				return msg
			}
		}
	case reflect.Map:
		for _, k := range v.MapKeys() {
			if msg := walkNumbers(v.MapIndex(k), fmt.Sprintf("%s[%v]", path, k)); msg != "" {
				return msg
			}
		}
	}
	return ""
}
