//go:build linux

package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// policyFileName is the name of the managed-policy JSON file the installer
// creates inside each browser's policy directory.
const policyFileName = "auto_coursera.json"

// policyDocument models the JSON structure Chrome reads from managed policy files.
type policyDocument struct {
	ExtensionInstallForcelist []string `json:"ExtensionInstallForcelist"`
}

// validatePolicyDir ensures the policy directory is an absolute path under /etc/.
func validatePolicyDir(dir string) error {
	if !filepath.IsAbs(dir) {
		return fmt.Errorf("policy directory must be an absolute path: %s", dir)
	}
	cleaned := filepath.Clean(dir)
	if !strings.HasPrefix(cleaned, "/etc/") {
		return fmt.Errorf("policy directory must be under /etc/: %s", dir)
	}
	return nil
}

// policyFilePath returns the full path to the policy file for a browser.
func policyFilePath(browser BrowserConfig) string {
	return filepath.Join(browser.LinuxPolicyDir, policyFileName)
}

// readPolicyFile reads and unmarshals the policy JSON.  If the file does not
// exist an empty document is returned without error.
func readPolicyFile(path string) (*policyDocument, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return &policyDocument{}, nil
		}
		return nil, fmt.Errorf("failed to read policy file %s: %w", path, err)
	}
	var doc policyDocument
	if err := json.Unmarshal(data, &doc); err != nil {
		return nil, fmt.Errorf("failed to parse policy file %s: %w", path, err)
	}
	return &doc, nil
}

// writePolicyFile marshals the document as indented JSON and writes it with
// mode 0644.
func writePolicyFile(path string, doc *policyDocument) error {
	data, err := json.MarshalIndent(doc, "", "    ")
	if err != nil {
		return fmt.Errorf("failed to marshal policy JSON: %w", err)
	}
	if err := os.WriteFile(path, data, 0644); err != nil {
		return fmt.Errorf("failed to write policy file %s: %w", path, err)
	}
	return nil
}

// WritePolicy creates the browser's managed-policy directory (if needed) and
// adds PolicyValue to the ExtensionInstallForcelist array, avoiding duplicates.
func WritePolicy(browser BrowserConfig) error {
	if err := validatePolicyDir(browser.LinuxPolicyDir); err != nil {
		return err
	}

	if err := os.MkdirAll(browser.LinuxPolicyDir, 0755); err != nil {
		return fmt.Errorf("failed to create policy dir %s: %w", browser.LinuxPolicyDir, err)
	}

	path := policyFilePath(browser)
	doc, err := readPolicyFile(path)
	if err != nil {
		return err
	}

	// Check for duplicates.
	for _, v := range doc.ExtensionInstallForcelist {
		if v == PolicyValue {
			return nil // Already present.
		}
	}

	doc.ExtensionInstallForcelist = append(doc.ExtensionInstallForcelist, PolicyValue)
	return writePolicyFile(path, doc)
}

// RemovePolicy removes PolicyValue from the browser's policy file.  If the
// forcelist becomes empty the file is deleted.
func RemovePolicy(browser BrowserConfig) error {
	if err := validatePolicyDir(browser.LinuxPolicyDir); err != nil {
		return err
	}

	path := policyFilePath(browser)
	doc, err := readPolicyFile(path)
	if err != nil {
		return err
	}

	filtered := make([]string, 0, len(doc.ExtensionInstallForcelist))
	for _, v := range doc.ExtensionInstallForcelist {
		if v != PolicyValue {
			filtered = append(filtered, v)
		}
	}

	if len(filtered) == len(doc.ExtensionInstallForcelist) {
		// Value was not present — nothing to remove.
		return nil
	}

	if len(filtered) == 0 {
		// No remaining entries — remove the file entirely.
		if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
			return fmt.Errorf("failed to remove empty policy file %s: %w", path, err)
		}
		return nil
	}

	doc.ExtensionInstallForcelist = filtered
	return writePolicyFile(path, doc)
}

// VerifyPolicy checks whether PolicyValue is present in the browser's
// policy file.
func VerifyPolicy(browser BrowserConfig) (bool, error) {
	path := policyFilePath(browser)
	doc, err := readPolicyFile(path)
	if err != nil {
		return false, err
	}
	for _, v := range doc.ExtensionInstallForcelist {
		if v == PolicyValue {
			return true, nil
		}
	}
	return false, nil
}
