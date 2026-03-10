# timepointlib

A Go library that provides a practical timepoint API:

1. `Create(...)`: capture registered in-scope stack/heap variables and caller location metadata (path, file, line, function).
2. `p.Resume(...)`: restore variables and run a continuation callback.
3. `p.RestoreStack(...)`: restore stack-tagged variables only.
4. `p.RestoreHeap(...)`: restore heap-tagged variables only.
5. `p.ToString()`: describe the timepoint.

## Why variable registration is explicit

Go does not expose a safe API to automatically capture all in-scope locals and jump to a real machine instruction pointer. This library uses:

- Explicit variable registration (`StackVar`, `HeapVar`, `AnyVar`).
- A symbolic program counter (`path`, `file`, `line`, `function`, and optional label), captured automatically at `Create(...)`.
- A continuation callback (`WithResume`) executed by `Resume`.

## Option 2: automatic variable capture by instrumentation

This repository includes a generator (`cmd/timepointgen`) that rewrites `timepoint.Create(...)` calls to inject all visible local variables automatically as `WithVariables(...)`.

How it works:

1. You write normal code with `timepoint.Create(...)` and no explicit `WithVariables(...)`.
2. Run the generator.
3. It rewrites each `Create` call into a form that captures all in-scope local variables.

Run it for the whole repo:

```bash
go run ./cmd/timepointgen -w .
```

Run it for a single folder:

```bash
go run ./cmd/timepointgen -w ./example_auto
```

## Complete examples (with AST transformation)

The following 3 examples show the end-to-end workflow:

1. Write code with `timepoint.Create(...)` and no `WithVariables(...)`.
2. Run the AST transformer (`timepointgen`).
3. Run the instrumented program.

### Example 1: checkpoint + `Resume` with override

Source code (before transformation):

```go
package main

import (
	"fmt"
	"timepointlib/timepoint"
)

func main() {
	step := 1
	status := "new"

	p, _ := timepoint.Create(
		timepoint.WithName("order-checkpoint"),
		timepoint.WithResume(func(*timepoint.Timepoint) error {
			fmt.Println("resume:", step, status)
			return nil
		}),
	)

	step = 99
	status = "mutated"
	_ = p.Resume(map[string]any{"status": "overridden"})
}
```

AST transformation:

```bash
go run ./cmd/timepointgen -w ./path/to/example1
```

Expected transformed output (simplified):

```go
p, _ := timepoint.Create(
	timepoint.WithVariables(
		timepoint.AnyVar("step", &step),
		timepoint.AnyVar("status", &status),
	),
	timepoint.WithName("order-checkpoint"),
	timepoint.WithResume(...),
)
```

Execution:

```bash
go run ./path/to/example1
```

### Example 2: `RestoreStack` + `RestoreHeap`

Source code (before transformation):

```go
package main

import "timepointlib/timepoint"

type Session struct{ Quota int }

func main() {
	counter := 10
	session := &Session{Quota: 3}

	p, _ := timepoint.Create(timepoint.WithName("partial-restore"))

	counter = 50
	session.Quota = 0

	_ = p.RestoreStack(nil) // restores variables tagged as stack
	_ = p.RestoreHeap(nil)  // restores variables tagged as heap
}
```

AST transformation:

```bash
go run ./cmd/timepointgen -w ./path/to/example2
```

Generated instrumentation (simplified):

```go
p, _ := timepoint.Create(
	timepoint.WithVariables(
		timepoint.AnyVar("counter", &counter),
		timepoint.AnyVar("session", &session),
	),
	timepoint.WithName("partial-restore"),
)
```

Execution:

```bash
go run ./path/to/example2
```

### Example 3: automatic flow with `go generate`

Source code:

```go
package main

import "timepointlib/timepoint"

//go:generate go run ../cmd/timepointgen -w .

func main() {
	value := 7
	p, _ := timepoint.Create(timepoint.WithName("auto-generate"))
	value = 100
	_ = p.Resume(nil)
}
```

Complete process:

```bash
go generate ./path/to/example3
go run ./path/to/example3
```

With this pattern, the AST step is integrated into the build/run flow of the example/project.

## Run the example

```bash
go run ./example
```

## Run the auto-instrumented example

```bash
go generate ./example_auto
go run ./example_auto
```

## Run tests

The package includes documented unit tests for API behavior, error paths, and deep-copy semantics.
See [TESTS.md](./TESTS.md) for a user-friendly testing guide (execution + objectives).

```bash
go test ./...
```
