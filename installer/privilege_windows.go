//go:build windows

package main

import (
	"fmt"

	"golang.org/x/sys/windows"
)

// CheckPrivilege verifies the process is running with Administrator
// privileges, which are required for writing HKLM registry keys.
func CheckPrivilege() error {
	var sid *windows.SID
	if err := windows.AllocateAndInitializeSid(
		&windows.SECURITY_NT_AUTHORITY,
		2,
		windows.SECURITY_BUILTIN_DOMAIN_RID,
		windows.DOMAIN_ALIAS_RID_ADMINS,
		0, 0, 0, 0, 0, 0,
		&sid,
	); err != nil {
		return fmt.Errorf("failed to allocate SID: %w", err)
	}
	defer windows.FreeSid(sid)

	var token windows.Token
	if err := windows.OpenProcessToken(windows.CurrentProcess(), windows.TOKEN_QUERY, &token); err != nil {
		return fmt.Errorf("failed to open process token: %w", err)
	}
	defer token.Close()

	member, err := token.IsMember(sid)
	if err != nil {
		return fmt.Errorf("failed to check admin membership: %w", err)
	}
	if !member {
		return fmt.Errorf("this installer requires Administrator privileges")
	}
	return nil
}
