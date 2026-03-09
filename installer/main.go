package main

import (
	"flag"
	"fmt"
	"os"
	"strings"
)

func main() {
	browserFlag := flag.String("browser", "all", "target a specific browser (chrome, edge, brave, chromium) or \"all\"")
	uninstallFlag := flag.Bool("uninstall", false, "remove extension policies instead of installing")
	quietFlag := flag.Bool("quiet", false, "minimal output, skip confirmation prompts")
	versionFlag := flag.Bool("version", false, "print version and exit")
	flag.Usage = func() {
		fmt.Fprintf(os.Stderr, "Usage: %s [options]\n\n", os.Args[0])
		fmt.Fprintln(os.Stderr, "Options:")
		flag.PrintDefaults()
		fmt.Fprintln(os.Stderr)
		fmt.Fprintln(os.Stderr, "Examples:")
		fmt.Fprintln(os.Stderr, "  installer                    # install for all detected browsers")
		fmt.Fprintln(os.Stderr, "  installer --browser chrome   # install for Chrome only")
		fmt.Fprintln(os.Stderr, "  installer --uninstall        # remove from all detected browsers")
		fmt.Fprintln(os.Stderr, "  installer --quiet            # non-interactive install")
	}
	flag.Parse()

	if *versionFlag {
		fmt.Printf("installer v%s\n", AppVersion)
		os.Exit(0)
	}

	// ── Privilege check ─────────────────────────────────────────────────
	if err := CheckPrivilege(); err != nil {
		PrintError(err.Error())
		os.Exit(1)
	}

	const totalSteps = 5

	// ── Banner ──────────────────────────────────────────────────────────
	if !*quietFlag {
		PrintBanner()
	}

	// ── Step 1: Detect OS ──────────────────────────────────────────────
	PrintStep(1, totalSteps, "Detecting operating system...")
	osName := DetectOS()
	PrintInfo(fmt.Sprintf("Operating system: %s", osName))

	// ── Step 2: Detect browsers ────────────────────────────────────────
	PrintStep(2, totalSteps, "Scanning for installed browsers...")
	detected := DetectInstalledBrowsers()

	// If a specific browser was requested, filter the detected list.
	if *browserFlag != "all" {
		target := strings.ToLower(*browserFlag)
		var filtered []BrowserConfig
		for _, b := range detected {
			if b.Name == target {
				filtered = append(filtered, b)
			}
		}
		detected = filtered
	}

	if len(detected) == 0 {
		PrintError("No supported browsers were detected on this system.")
		if *browserFlag != "all" {
			PrintInfo(fmt.Sprintf("The requested browser %q was not found.", *browserFlag))
		}
		os.Exit(1)
	}

	// ── Step 3: Configure policies ─────────────────────────────────────
	action := "install"
	if *uninstallFlag {
		action = "remove"
	}
	PrintStep(3, totalSteps, "Configuring browser policies...")

	if !*quietFlag {
		selected := SelectBrowser(detected)
		detected = selected

		fmt.Println()
		if *uninstallFlag {
			PrintWarning("The extension policy will be REMOVED from the selected browsers.")
		} else {
			PrintInfo("The extension will be force-installed via browser policy.")
		}

		if !PromptYesNo(fmt.Sprintf("Proceed to %s for %d browser(s)?", action, len(detected))) {
			PrintInfo("Aborted by user.")
			os.Exit(0)
		}
	}

	results := make([]InstallResult, 0, len(detected))

	for _, browser := range detected {
		var err error
		if *uninstallFlag {
			err = RemovePolicy(browser)
		} else {
			err = WritePolicy(browser)
		}

		result := InstallResult{Browser: browser}
		if err != nil {
			result.Success = false
			result.Message = err.Error()
		} else {
			result.Success = true
			if *uninstallFlag {
				result.Message = "Policy removed"
			} else {
				result.Message = "Policy installed"
			}
		}
		results = append(results, result)

		if result.Success {
			PrintSuccess(fmt.Sprintf("%s — %s", browser.DisplayName, result.Message))
		} else {
			PrintError(fmt.Sprintf("%s — %s", browser.DisplayName, result.Message))
		}
	}

	// ── Step 4: Verify ─────────────────────────────────────────────────
	PrintStep(4, totalSteps, "Verifying installation...")

	for i, result := range results {
		if !result.Success {
			continue
		}
		verified := VerifyInstallation(result.Browser)
		if *uninstallFlag {
			// After uninstall, verification should return false (policy gone).
			if !verified {
				PrintSuccess(fmt.Sprintf("%s — policy successfully removed", result.Browser.DisplayName))
			} else {
				PrintWarning(fmt.Sprintf("%s — policy may still be present", result.Browser.DisplayName))
				results[i].Message = "Policy removal could not be verified"
			}
		} else {
			if verified {
				PrintSuccess(fmt.Sprintf("%s — policy verified", result.Browser.DisplayName))
			} else {
				PrintWarning(fmt.Sprintf("%s — policy could not be verified", result.Browser.DisplayName))
				results[i].Message = "Policy written but verification failed"
			}
		}
	}

	// ── Step 5: Done ───────────────────────────────────────────────────
	PrintStep(5, totalSteps, "Done!")
	PrintSummary(results)

	if !*uninstallFlag {
		PrintInfo("Please restart your browser(s) to activate the extension.")
	} else {
		PrintInfo("Please restart your browser(s) to complete removal.")
	}
	fmt.Println()
}
