//go:build windows

package main

import (
	"fmt"
	"strconv"

	"golang.org/x/sys/windows/registry"
)

// WritePolicy adds PolicyValue to the browser's ExtensionInstallForcelist
// registry key under HKLM.  If the value already exists the call is a no-op.
func WritePolicy(browser BrowserConfig) error {
	k, _, err := registry.CreateKey(
		registry.LOCAL_MACHINE,
		browser.WindowsRegPath,
		registry.ALL_ACCESS,
	)
	if err != nil {
		return fmt.Errorf("failed to open/create registry key %s: %w", browser.WindowsRegPath, err)
	}
	defer k.Close()

	// Enumerate existing values to find duplicates and the highest numeric index.
	names, err := k.ReadValueNames(-1)
	if err != nil {
		return fmt.Errorf("failed to read registry values: %w", err)
	}

	maxIndex := 0
	for _, name := range names {
		val, _, verr := k.GetStringValue(name)
		if verr != nil {
			continue
		}
		if val == PolicyValue {
			// Already configured — nothing to do.
			return nil
		}
		idx, perr := strconv.Atoi(name)
		if perr == nil && idx > maxIndex {
			maxIndex = idx
		}
	}

	nextIndex := strconv.Itoa(maxIndex + 1)
	if err := k.SetStringValue(nextIndex, PolicyValue); err != nil {
		return fmt.Errorf("failed to write registry value: %w", err)
	}
	return nil
}

// RemovePolicy deletes the PolicyValue entry from the browser's
// ExtensionInstallForcelist registry key.
func RemovePolicy(browser BrowserConfig) error {
	k, err := registry.OpenKey(
		registry.LOCAL_MACHINE,
		browser.WindowsRegPath,
		registry.ALL_ACCESS,
	)
	if err != nil {
		// Key does not exist — nothing to remove.
		return nil
	}
	defer k.Close()

	names, err := k.ReadValueNames(-1)
	if err != nil {
		return fmt.Errorf("failed to read registry values: %w", err)
	}

	for _, name := range names {
		val, _, verr := k.GetStringValue(name)
		if verr != nil {
			continue
		}
		if val == PolicyValue {
			if derr := k.DeleteValue(name); derr != nil {
				return fmt.Errorf("failed to delete registry value %s: %w", name, derr)
			}
			return nil
		}
	}

	return nil
}

// VerifyPolicy checks whether PolicyValue is present in the browser's
// ExtensionInstallForcelist registry key.
func VerifyPolicy(browser BrowserConfig) (bool, error) {
	k, err := registry.OpenKey(
		registry.LOCAL_MACHINE,
		browser.WindowsRegPath,
		registry.QUERY_VALUE,
	)
	if err != nil {
		return false, nil
	}
	defer k.Close()

	names, err := k.ReadValueNames(-1)
	if err != nil {
		return false, fmt.Errorf("failed to read registry values: %w", err)
	}

	for _, name := range names {
		val, _, verr := k.GetStringValue(name)
		if verr != nil {
			continue
		}
		if val == PolicyValue {
			return true, nil
		}
	}

	return false, nil
}
