package printer

import (
	"fmt"
	"strings"
)

func PadRight(str string, length int) string {
	if len(str) >= length {
		return str[:length]
	}
	return str + strings.Repeat(" ", length-len(str))
}

func PadLeft(str string, length int) string {
	if len(str) >= length {
		return str[:length]
	}
	return strings.Repeat(" ", length-len(str)) + str
}

func WrapText(text string, width int) []string {
	var lines []string
	words := strings.Fields(text)
	if len(words) == 0 {
		return []string{""}
	}

	currentLine := words[0]
	for _, word := range words[1:] {
		if len(currentLine)+1+len(word) <= width {
			currentLine += " " + word
		} else {
			lines = append(lines, currentLine)
			currentLine = word
		}
	}
	lines = append(lines, currentLine)
	return lines
}

func Amount(val float64) string {
	return fmt.Sprintf("%.2f", val)
}

func GetLineWidth(width string) int {
	if width == "2inch" {
		return 32
	}
	return 48 // Default 3inch
}
