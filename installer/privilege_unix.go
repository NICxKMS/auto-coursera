//go:build linux || darwin

package main

import (
	"fmt"
	"os"
	"runtime"
)

// CheckPrivilege verifies the process has the elevated privileges required
// for writing browser policies.  On Linux this means root (euid 0); on macOS
// no elevation is needed because policies are written via `defaults write`
// for the current user.
func CheckPrivilege() error {
	if runtime.GOOS == "linux" && os.Geteuid() != 0 {
		return fmt.Errorf("this installer must be run as root on Linux (use sudo)")
	}
	return nil
}
