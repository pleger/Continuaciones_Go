# Test README

This document explains:

1. How to run the tests.
2. The objective of each test suite.

## Requirements

- Go installed and available in `PATH`.
- Run commands from the project root.

## How to run tests

Full run (recommended):

```bash
mkdir -p .gocache
GOCACHE=$(pwd)/.gocache go test ./...
```

Verbose run (`-v`):

```bash
mkdir -p .gocache
GOCACHE=$(pwd)/.gocache go test ./... -v
```

Count executed scenarios (tests + subtests):

```bash
mkdir -p .gocache
GOCACHE=$(pwd)/.gocache go test ./... -v | rg '^=== RUN|^    --- RUN' | wc -l
```

## Test objectives

### `timepoint/timepoint_test.go`
Objective: validate the main public behavior of the library.

Covers:

- Snapshot creation (`Create`) and metadata.
- Scope-based restore (`RestoreStack`, `RestoreHeap`).
- Resume with callback (`Resume`).
- Error handling and validations.
- String representation (`ToString`).

### `timepoint/deepcopy_test.go`
Objective: validate deep-copy semantics and type coercion.

Covers:

- Copies of nested structures.
- Preservation of cycles and shared references.
- Special cases (functions/channels by reference).
- `coerceToType` rules (success and failure cases).

### `timepoint/timepoint_matrix_test.go`
Objective: cover a broad matrix of scenarios to prevent regressions.

Covers:

- Conversion combinations in `coerceToType`.
- Nilability rules in `canBeNil`.
- `deepCopy` matrices for primitive and reference types.
- `Create` + restore round-trip with multiple data types.

### `cmd/timepointgen/main_test.go`
Objective: validate the automatic instrumentation generator.

Covers:

- Detection of `timepoint` imports.
- Inner scope selection.
- AST injection of `WithVariables(...)` inside `Create(...)`.

## Assertion library used

All test files use the internal assertion helper library:

- `internal/testx`

Benefit: more readable assertions (`testx.Equal`, `testx.NoError`, `testx.Contains`, etc.) and consistent style across the test suite.
