//go:build linux || darwin

package main

import (
	"os"
	"os/exec"
	"runtime"
)

// macOSAppBundles maps the BrowserConfig.Name to the .app bundle name found
// inside /Applications on macOS.
var macOSAppBundles = map[string]string{
	"chrome":   "Google Chrome.app",
	"edge":     "Microsoft Edge.app",
	"brave":    "Brave Browser.app",
	"chromium": "Chromium.app",
}

// isBrowserInstalled checks whether the given browser exists on a Unix system.
// On Linux it relies solely on PATH lookup; on macOS it additionally checks
// the /Applications folder for a matching .app bundle.
func isBrowserInstalled(browser BrowserConfig) bool {
	// Check PATH first — works on both Linux and macOS.
	for _, cmd := range browser.DetectCommands {
		if _, err := exec.LookPath(cmd); err == nil {
			return true
		}
	}

	// macOS: check /Applications for known .app bundles.
	if runtime.GOOS == "darwin" {
		if bundle, ok := macOSAppBundles[browser.Name]; ok {
			info, err := os.Stat("/Applications/" + bundle)
			if err == nil && info.IsDir() {
				return true
			}
		}
	}

	return false
}
