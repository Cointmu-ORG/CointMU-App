# ==========================================
# CointMU Desktop Client
# ==========================================

VERSION = 1
PATCHLEVEL = 7
SUBLEVEL = 3
EXTRAVERSION = Garnet

help:
	@echo "============================================="
	@echo "  CointMU Desktop Makefile Help           	"
	@echo "============================================="
	@echo "  dev        	- Start development server"
	@echo "  build:win  	- Build Windows executable"
	@echo "  build:mac  	- Build MacOS executable"
	@echo "  build:linux 	- Build Linux executable"
	@echo "  clean      	- Clean build artifacts"
	@echo "  help       	- Print this help message"
	@echo "============================================="

dev:
	npm run dev

build\:win:
	npm run build:win
	@echo ""
	@echo "=========================================="
	@echo "  CointMU Desktop Client"
	@echo "  Version: $(VERSION).$(PATCHLEVEL).$(SUBLEVEL)"
	@echo "  Release: $(EXTRAVERSION)"
	@echo "=========================================="
	@echo ""
	@echo "Build completed!"
	@echo "Executable: ./dist/$(EXTRAVERSION)"
	@echo ""

build\:linux:
	npm run build:linux
	@echo ""
	@echo "=========================================="
	@echo "  CointMU Desktop Client"
	@echo "  Version: $(VERSION).$(PATCHLEVEL).$(SUBLEVEL)"
	@echo "  Release: $(EXTRAVERSION)"
	@echo "=========================================="
	@echo ""
	@echo "Build completed!"
	@echo "Executable: ./dist/$(EXTRAVERSION)"
	@echo ""

build\:mac:
	npm run build:mac
	@echo ""
	@echo "=========================================="
	@echo "  CointMU Desktop Client"
	@echo "  Version: $(VERSION).$(PATCHLEVEL).$(SUBLEVEL)"
	@echo "  Release: $(EXTRAVERSION)"
	@echo "=========================================="
	@echo ""
	@echo "Build completed!"
	@echo "Executable: ./dist/$(EXTRAVERSION)"
	@echo ""

clean:
	rm -rf out dist build