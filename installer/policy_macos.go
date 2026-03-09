//go:build darwin

package main

import (
	"fmt"
	"os/exec"
	"strings"
)

// WritePolicy adds PolicyValue to the browser's ExtensionInstallForcelist
// plist array.  If the array does not exist yet it is created.
func WritePolicy(browser BrowserConfig) error {
	// Check whether the array already exists and contains our value.
	existing, err := readPlistArray(browser.MacOSPlistDomain, "ExtensionInstallForcelist")
	if err == nil {
		for _, v := range existing {
			if v == PolicyValue {
				return nil // Already present.
			}
		}
		// Array exists — append.
		cmd := exec.Command("defaults", "write", browser.MacOSPlistDomain,
			"ExtensionInstallForcelist", "-array-add", PolicyValue)
		if out, err := cmd.CombinedOutput(); err != nil {
			return fmt.Errorf("defaults write -array-add failed: %s: %w", string(out), err)
		}
		return nil
	}

	// Array doesn't exist yet — create it.
	cmd := exec.Command("defaults", "write", browser.MacOSPlistDomain,
		"ExtensionInstallForcelist", "-array", PolicyValue)
	if out, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("defaults write -array failed: %s: %w", string(out), err)
	}
	return nil
}

// RemovePolicy removes PolicyValue from the browser's ExtensionInstallForcelist.
// If the list becomes empty the key is deleted entirely.
func RemovePolicy(browser BrowserConfig) error {
	existing, err := readPlistArray(browser.MacOSPlistDomain, "ExtensionInstallForcelist")
	if err != nil {
		// Key doesn't exist — nothing to remove.
		return nil
	}

	var remaining []string
	for _, v := range existing {
		if v != PolicyValue {
			remaining = append(remaining, v)
		}
	}

	if len(remaining) == len(existing) {
		// Value was not present.
		return nil
	}

	if len(remaining) == 0 {
		cmd := exec.Command("defaults", "delete", browser.MacOSPlistDomain, "ExtensionInstallForcelist")
		if out, err := cmd.CombinedOutput(); err != nil {
			return fmt.Errorf("defaults delete failed: %s: %w", string(out), err)
		}
		return nil
	}

	// Rebuild the array with the remaining entries.
	args := []string{"write", browser.MacOSPlistDomain, "ExtensionInstallForcelist", "-array"}
	args = append(args, remaining...)
	cmd := exec.Command("defaults", args...)
	if out, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("defaults write -array failed: %s: %w", string(out), err)
	}
	return nil
}

// VerifyPolicy checks whether PolicyValue is present in the browser's
// ExtensionInstallForcelist plist array.
func VerifyPolicy(browser BrowserConfig) (bool, error) {
	existing, err := readPlistArray(browser.MacOSPlistDomain, "ExtensionInstallForcelist")
	if err != nil {
		return false, nil
	}
	for _, v := range existing {
		if v == PolicyValue {
			return true, nil
		}
	}
	return false, nil
}

// readPlistArray reads a plist array key using `defaults read` and returns
// the values as a string slice.  Returns an error if the key does not exist.
//
// `defaults read` output for arrays looks like:
//
//	(
//	    "value1",
//	    "value2"
//	)
func readPlistArray(domain, key string) ([]string, error) {
	cmd := exec.Command("defaults", "read", domain, key)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("defaults read failed: %w", err)
	}
	return parsePlistArray(string(out))
}

// parsePlistArray parses the parenthesised array format emitted by
// `defaults read`.
func parsePlistArray(raw string) ([]string, error) {
	raw = strings.TrimSpace(raw)
	if !strings.HasPrefix(raw, "(") || !strings.HasSuffix(raw, ")") {
		return nil, fmt.Errorf("unexpected plist array format: %q", raw)
	}

	// Strip the surrounding parentheses.
	inner := raw[1 : len(raw)-1]
	inner = strings.TrimSpace(inner)
	if inner == "" {
		return nil, nil
	}

	var values []string
	for _, line := range strings.Split(inner, "\n") {
		line = strings.TrimSpace(line)
		line = strings.TrimSuffix(line, ",")
		line = strings.TrimSpace(line)
		// Remove surrounding quotes if present.
		if len(line) >= 2 && line[0] == '"' && line[len(line)-1] == '"' {
			line = line[1 : len(line)-1]
		}
		if line != "" {
			values = append(values, line)
		}
	}

	return values, nil
}
