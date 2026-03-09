package main

import (
	"bufio"
	"fmt"
	"os"
	"strings"
)

// ANSI escape sequences used when the terminal supports color output.
const (
	colorReset  = "\033[0m"
	colorRed    = "\033[31m"
	colorGreen  = "\033[32m"
	colorYellow = "\033[33m"
	colorCyan   = "\033[36m"
	colorBold   = "\033[1m"
)

// useColor is resolved once at init time so every print helper can reuse it.
var useColor = supportsColor()

// supportsColor returns true when the terminal is likely to render ANSI colors.
func supportsColor() bool {
	// Respect NO_COLOR (https://no-color.org/).
	if os.Getenv("NO_COLOR") != "" {
		return false
	}

	// Respect FORCE_COLOR.
	if os.Getenv("FORCE_COLOR") != "" {
		return true
	}

	// "dumb" terminals have no color capability.
	if os.Getenv("TERM") == "dumb" {
		return false
	}

	// Check whether stdout is a terminal (character device).
	fi, err := os.Stdout.Stat()
	if err != nil {
		return false
	}
	return (fi.Mode() & os.ModeCharDevice) != 0
}

// colorize wraps text in ANSI color codes if the terminal supports it.
func colorize(color, text string) string {
	if !useColor {
		return text
	}
	return color + text + colorReset
}

// PrintBanner displays the application header.
func PrintBanner() {
	fmt.Println()
	fmt.Println(colorize(colorBold+colorCyan, "╔══════════════════════════════════════════╗"))
	fmt.Println(colorize(colorBold+colorCyan, "║   "+ExtensionName+" Installer   ║"))
	fmt.Println(colorize(colorBold+colorCyan, "║              v"+AppVersion+"                      ║"))
	fmt.Println(colorize(colorBold+colorCyan, "╚══════════════════════════════════════════╝"))
	fmt.Println()
}

// PrintSuccess prints a green success message with a ✓ prefix.
func PrintSuccess(msg string) {
	fmt.Println(colorize(colorGreen, "  ✓ "+msg))
}

// PrintError prints a red error message with a ✗ prefix.
func PrintError(msg string) {
	fmt.Println(colorize(colorRed, "  ✗ "+msg))
}

// PrintWarning prints a yellow warning with a ⚠ prefix.
func PrintWarning(msg string) {
	fmt.Println(colorize(colorYellow, "  ⚠ "+msg))
}

// PrintInfo prints a cyan informational message with an ℹ prefix.
func PrintInfo(msg string) {
	fmt.Println(colorize(colorCyan, "  ℹ "+msg))
}

// PrintStep prints a numbered step indicator, e.g. "[1/5] Detecting OS..."
func PrintStep(step int, total int, msg string) {
	prefix := fmt.Sprintf("[%d/%d]", step, total)
	fmt.Println(colorize(colorBold, prefix) + " " + msg)
}

// PromptYesNo asks a yes/no question; default is yes (empty input → true).
func PromptYesNo(question string) bool {
	fmt.Printf("%s [Y/n]: ", question)
	reader := bufio.NewReader(os.Stdin)
	input, err := reader.ReadString('\n')
	if err != nil {
		return false
	}
	input = strings.TrimSpace(strings.ToLower(input))
	return input == "" || input == "y" || input == "yes"
}

// PrintSummary renders a table of InstallResults.
func PrintSummary(results []InstallResult) {
	fmt.Println()
	fmt.Println(colorize(colorBold, "  Summary"))
	fmt.Println(colorize(colorBold, "  "+strings.Repeat("─", 54)))
	fmt.Printf("  %-20s %-10s %s\n", "Browser", "Status", "Details")
	fmt.Println("  " + strings.Repeat("─", 54))

	for _, r := range results {
		status := colorize(colorGreen, "OK")
		if !r.Success {
			status = colorize(colorRed, "FAIL")
		} else if r.AlreadySet {
			status = colorize(colorYellow, "SKIP")
		}
		fmt.Printf("  %-20s %-10s %s\n", r.Browser.DisplayName, status, r.Message)
	}

	fmt.Println("  " + strings.Repeat("─", 54))
	fmt.Println()
}
