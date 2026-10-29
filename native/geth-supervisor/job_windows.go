package main

import (
	"fmt"
	"syscall"
	"unsafe"
)

const (
	jobObjectExtendedLimitInformation = 9
	jobObjectLimitKillOnJobClose      = 0x2000
	processSetQuota                   = 0x0100
	processTerminate                  = 0x0001
)

var (
	createJobObject          = kernel32.NewProc("CreateJobObjectW")
	setInformationJobObject  = kernel32.NewProc("SetInformationJobObject")
	assignProcessToJobObject = kernel32.NewProc("AssignProcessToJobObject")
)

// JOBOBJECT_BASIC_LIMIT_INFORMATION; Go lays it out like the C struct.
type jobBasicLimitInformation struct {
	PerProcessUserTimeLimit int64
	PerJobUserTimeLimit     int64
	LimitFlags              uint32
	MinimumWorkingSetSize   uintptr
	MaximumWorkingSetSize   uintptr
	ActiveProcessLimit      uint32
	Affinity                uintptr
	PriorityClass           uint32
	SchedulingClass         uint32
}

// JOBOBJECT_EXTENDED_LIMIT_INFORMATION.
type jobExtendedLimitInformation struct {
	BasicLimitInformation jobBasicLimitInformation
	IoInfo                [6]uint64
	ProcessMemoryLimit    uintptr
	JobMemoryLimit        uintptr
	PeakProcessMemoryUsed uintptr
	PeakJobMemoryUsed     uintptr
}

// dieWithThisProcess puts the process in a job that Windows kills when this
// supervisor ends, however it ends, so geth never outlives it. The job handle
// stays open, unreferenced, until then.
func dieWithThisProcess(pid uint32) error {
	job, _, err := createJobObject.Call(0, 0)
	if job == 0 {
		return fmt.Errorf("cannot create a job: %w", err)
	}
	var info jobExtendedLimitInformation
	info.BasicLimitInformation.LimitFlags = jobObjectLimitKillOnJobClose
	ok, _, err := setInformationJobObject.Call(job,
		jobObjectExtendedLimitInformation,
		uintptr(unsafe.Pointer(&info)), unsafe.Sizeof(info))
	if ok == 0 {
		return fmt.Errorf("cannot configure the job: %w", err)
	}
	process, err := syscall.OpenProcess(
		processSetQuota|processTerminate, false, pid)
	if err != nil {
		return fmt.Errorf("cannot open geth %d: %w", pid, err)
	}
	defer syscall.CloseHandle(process)
	if ok, _, err := assignProcessToJobObject.Call(job, uintptr(process)); ok == 0 {
		return fmt.Errorf("cannot put geth %d in the job: %w", pid, err)
	}
	return nil
}
