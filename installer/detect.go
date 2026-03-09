package main

import "runtime"

// DetectOS returns the current operating system identifier.
func DetectOS() string {
	return runtime.GOOS
}

// DetectInstalledBrowsers returns the subset of SupportedBrowsers that are
// present on the current system.  The actual detection logic lives in the
// platform-specific detect_*.go files which define isBrowserInstalled.
func DetectInstalledBrowsers() []BrowserConfig {
	var found []BrowserConfig
	for _, b := range SupportedBrowsers {
		if isBrowserInstalled(b) {
			found = append(found, b)
		}
	}
	return found
}
