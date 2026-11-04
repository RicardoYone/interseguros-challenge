// Package internal_test is the architecture guardian: it fails the build when the
// source breaks a closed pattern of the project.
package internal_test

import (
	"go/ast"
	"go/parser"
	"go/token"
	"io/fs"
	"path/filepath"
	"strconv"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const modulePath = "github.com/RicardoYone/interseguros-challenge/services/qr-api"

type sourceFile struct {
	path string
	ast  *ast.File
}

// parseProductionFiles returns every non-test Go file of the service.
func parseProductionFiles(t *testing.T) []sourceFile {
	t.Helper()

	var files []sourceFile
	fileSet := token.NewFileSet()
	err := filepath.WalkDir("..", func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if entry.IsDir() || !strings.HasSuffix(path, ".go") || strings.HasSuffix(path, "_test.go") {
			return nil
		}

		parsed, err := parser.ParseFile(fileSet, path, nil, parser.SkipObjectResolution)
		if err != nil {
			return err
		}
		files = append(files, sourceFile{path: filepath.ToSlash(path), ast: parsed})

		return nil
	})
	require.NoError(t, err)

	return files
}

func importsOf(t *testing.T, file sourceFile) []string {
	t.Helper()

	imports := make([]string, 0, len(file.ast.Imports))
	for _, spec := range file.ast.Imports {
		path, err := strconv.Unquote(spec.Path.Value)
		require.NoError(t, err)
		imports = append(imports, path)
	}

	return imports
}

// selectors returns each "x.Name" expression in the file. Receivers that are not a
// plain identifier, such as the result of a call, appear as ".Name".
func selectors(file sourceFile) []string {
	var found []string
	ast.Inspect(file.ast, func(node ast.Node) bool {
		if selector, ok := node.(*ast.SelectorExpr); ok {
			if receiver, ok := selector.X.(*ast.Ident); ok {
				found = append(found, receiver.Name+"."+selector.Sel.Name)
			} else {
				found = append(found, "."+selector.Sel.Name)
			}
		}

		return true
	})

	return found
}

func TestArchitecture(t *testing.T) {
	t.Parallel()

	files := parseProductionFiles(t)

	t.Run("finds the files it guards, so that a wrong path cannot pass by scanning nothing", func(t *testing.T) {
		t.Parallel()

		paths := make([]string, 0, len(files))
		for _, file := range files {
			paths = append(paths, file.path)
		}

		assert.Contains(t, paths, "../internal/factorization/qr.go")
		assert.Contains(t, paths, "../internal/transport/rest/app.go")
		assert.Contains(t, paths, "../cmd/api/main.go")
	})

	t.Run("keeps the domain on the standard library, away from transport and serialization", func(t *testing.T) {
		t.Parallel()

		forbidden := map[string]bool{"net/http": true, "encoding/json": true}
		for _, file := range files {
			if !strings.Contains(file.path, "/internal/factorization/") {
				continue
			}
			for _, path := range importsOf(t, file) {
				isThirdParty := strings.Contains(strings.SplitN(path, "/", 2)[0], ".")
				assert.False(t, isThirdParty || forbidden[path], "%s must not import %s", file.path, path)
			}
		}
	})

	t.Run("keeps Fiber inside the transport layer", func(t *testing.T) {
		t.Parallel()

		for _, file := range files {
			if strings.Contains(file.path, "/internal/transport/") {
				continue
			}
			for _, path := range importsOf(t, file) {
				assert.False(t, strings.Contains(path, "gofiber/fiber") && !strings.HasSuffix(file.path, "cmd/api/main.go"),
					"%s must not import %s", file.path, path)
			}
		}
	})

	t.Run("keeps the transport layer away from outbound adapters", func(t *testing.T) {
		t.Parallel()

		for _, file := range files {
			if !strings.Contains(file.path, "/internal/transport/") {
				continue
			}
			for _, path := range importsOf(t, file) {
				assert.NotEqual(t, modulePath+"/internal/statistics", path, "%s must depend on a port", file.path)
			}
		}
	})

	t.Run("uses the server local time instead of converting to UTC", func(t *testing.T) {
		t.Parallel()

		for _, file := range files {
			for _, selector := range selectors(file) {
				assert.False(t, strings.HasSuffix(selector, ".UTC"), "%s must use local time", file.path)
			}
		}
	})

	t.Run("logs through slog only", func(t *testing.T) {
		t.Parallel()

		for _, file := range files {
			for _, path := range importsOf(t, file) {
				assert.NotEqual(t, "log", path, "%s must log through slog", file.path)
			}
			for _, selector := range selectors(file) {
				assert.False(t, strings.HasPrefix(selector, "fmt.Print"), "%s must log through slog", file.path)
			}
		}
	})

	t.Run("reads the environment only in the composition root", func(t *testing.T) {
		t.Parallel()

		for _, file := range files {
			if strings.HasSuffix(file.path, "cmd/api/main.go") {
				continue
			}
			for _, selector := range selectors(file) {
				assert.NotEqual(t, "os.Getenv", selector, "%s must receive its configuration", file.path)
			}
		}
	})
}
