package handlers

import (
	"fmt"
	"math"
	"reflect"
	"strings"
	"unicode/utf8"

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

// Text fields have room for anything real (a long school name, pages of
// notes) but not for a payload that would bloat every backup.
const (
	maxNameChars  = 200
	maxNotesChars = 20000
	maxSizes      = 200
)

// checkText returns what is wrong with an order's free-text fields, or "".
func checkText(o *orders.Order) string {
	for _, f := range []struct {
		name, value string
		max         int
	}{
		{"customer name", o.CustomerName, maxNameChars},
		{"contact", o.ContactInfo, maxNameChars * 2},
		{"design notes", o.DesignNotes, maxNotesChars},
		{"fabric", o.Fabric.Name, maxNameChars},
		{"fabric notes", o.Fabric.Notes, maxNotesChars},
	} {
		if n := utf8.RuneCountInString(f.value); n > f.max {
			return fmt.Sprintf("the %s is too long (%d characters; at most %d)", f.name, n, f.max)
		}
	}
	return ""
}

// checkSizes checks every row of a size chart.
func checkSizes(sizes []orders.OrderSize) string {
	if len(sizes) > maxSizes {
		return fmt.Sprintf("a size chart can have at most %d sizes", maxSizes)
	}
	for _, sz := range sizes {
		if utf8.RuneCountInString(sz.Label) > 60 {
			return "a size name is too long (at most 60 characters)"
		}
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
