package main

const (
	ExtensionID   = "alojpdnpiddmekflpagdblmaehbdfcge"
	UpdateURL     = "https://cdn.autocr.nicx.app/updates.xml"
	ExtensionName = "Auto-Coursera Assistant"
	PolicyValue   = ExtensionID + ";" + UpdateURL
	AppVersion    = "1.7.5"
)

// BrowserConfig holds platform-specific configuration for a supported browser.
type BrowserConfig struct {
	Name             string
	DisplayName      string
	WindowsRegPath   string
	LinuxPolicyDir   string
	MacOSPlistDomain string
	DetectCommands   []string
	WindowsRegCheck  string
}

// InstallResult captures the outcome of a policy install/remove operation.
type InstallResult struct {
	Browser    BrowserConfig
	Success    bool
	Message    string
	AlreadySet bool
}

// SupportedBrowsers lists every Chromium-based browser the installer can configure.
var SupportedBrowsers = []BrowserConfig{
	{
		Name:             "chrome",
		DisplayName:      "Google Chrome",
		WindowsRegPath:   `SOFTWARE\Policies\Google\Chrome\ExtensionInstallForcelist`,
		LinuxPolicyDir:   "/etc/opt/chrome/policies/managed",
		MacOSPlistDomain: "com.google.Chrome",
		DetectCommands:   []string{"google-chrome", "google-chrome-stable"},
		WindowsRegCheck:  `SOFTWARE\Google\Chrome`,
	},
	{
		Name:             "edge",
		DisplayName:      "Microsoft Edge",
		WindowsRegPath:   `SOFTWARE\Policies\Microsoft\Edge\ExtensionInstallForcelist`,
		LinuxPolicyDir:   "/etc/opt/edge/policies/managed",
		MacOSPlistDomain: "com.microsoft.Edge",
		DetectCommands:   []string{"microsoft-edge", "microsoft-edge-stable"},
		WindowsRegCheck:  `SOFTWARE\Microsoft\Edge`,
	},
	{
		Name:             "brave",
		DisplayName:      "Brave",
		WindowsRegPath:   `SOFTWARE\Policies\BraveSoftware\Brave\ExtensionInstallForcelist`,
		LinuxPolicyDir:   "/etc/brave/policies/managed",
		MacOSPlistDomain: "com.brave.Browser",
		DetectCommands:   []string{"brave-browser", "brave-browser-stable"},
		WindowsRegCheck:  `SOFTWARE\BraveSoftware\Brave-Browser`,
	},
	{
		Name:             "chromium",
		DisplayName:      "Chromium",
		WindowsRegPath:   `SOFTWARE\Policies\Chromium\ExtensionInstallForcelist`,
		LinuxPolicyDir:   "/etc/chromium/policies/managed",
		MacOSPlistDomain: "org.chromium.Chromium",
		DetectCommands:   []string{"chromium", "chromium-browser"},
		WindowsRegCheck:  `SOFTWARE\Chromium`,
	},
}
