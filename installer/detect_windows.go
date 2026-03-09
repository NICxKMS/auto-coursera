//go:build windows

package main

import (
	"os/exec"

	"golang.org/x/sys/windows/registry"
)

// isBrowserInstalled checks whether the given browser is present on Windows by
// probing the registry (HKLM and HKCU) and then falling back to a PATH lookup.
func isBrowserInstalled(browser BrowserConfig) bool {
	// Try HKEY_LOCAL_MACHINE.
	k, err := registry.OpenKey(registry.LOCAL_MACHINE, browser.WindowsRegCheck, registry.QUERY_VALUE)
	if err == nil {
		k.Close()
		return true
	}

	// Try HKEY_CURRENT_USER.
	k, err = registry.OpenKey(registry.CURRENT_USER, browser.WindowsRegCheck, registry.QUERY_VALUE)
	if err == nil {
		k.Close()
		return true
	}

	// Fallback: check PATH.
	for _, cmd := range browser.DetectCommands {
		if _, err := exec.LookPath(cmd); err == nil {
			return true
		}
	}

	return false
}
