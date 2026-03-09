package main

// VerifyInstallation delegates to the platform-specific VerifyPolicy and
// returns true when the extension policy is confirmed in place.
func VerifyInstallation(browser BrowserConfig) bool {
	ok, err := VerifyPolicy(browser)
	if err != nil {
		PrintWarning("Verification error for " + browser.DisplayName + ": " + err.Error())
		return false
	}
	return ok
}
