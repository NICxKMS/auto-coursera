package main

import (
	"bufio"
	"fmt"
	"os"
	"strconv"
	"strings"
)

// ListBrowsers prints the detected browsers as a numbered list.
func ListBrowsers(browsers []BrowserConfig) {
	for i, b := range browsers {
		fmt.Printf("  %d. %s\n", i+1, b.DisplayName)
	}
}

// SelectBrowser prompts the user to choose which browsers to configure.
// The user may enter a single number, a comma-separated list of numbers, "all",
// or press Enter to accept the default (all browsers).
func SelectBrowser(browsers []BrowserConfig) []BrowserConfig {
	fmt.Println()
	fmt.Println("Detected browsers:")
	ListBrowsers(browsers)
	fmt.Println()
	fmt.Print("Select browsers to configure (enter numbers separated by commas, or \"all\") [all]: ")

	reader := bufio.NewReader(os.Stdin)
	input, err := reader.ReadString('\n')
	if err != nil {
		// On read error default to all.
		return browsers
	}

	input = strings.TrimSpace(input)

	// Empty input or explicit "all" → return everything.
	if input == "" || strings.EqualFold(input, "all") {
		return browsers
	}

	parts := strings.Split(input, ",")
	seen := make(map[int]bool)
	var selected []BrowserConfig

	for _, p := range parts {
		p = strings.TrimSpace(p)
		n, err := strconv.Atoi(p)
		if err != nil || n < 1 || n > len(browsers) {
			PrintWarning(fmt.Sprintf("Ignoring invalid selection: %s", p))
			continue
		}
		if !seen[n] {
			seen[n] = true
			selected = append(selected, browsers[n-1])
		}
	}

	if len(selected) == 0 {
		PrintWarning("No valid selection — defaulting to all browsers.")
		return browsers
	}

	return selected
}
