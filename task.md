# Task: Implement Dynamic KEGG Pathway Search and Download

## Context
The user wants to search for KEGG pathways by name (e.g., "Cell Cycle") directly in the app and download them into the local templates folder, avoiding direct interaction with the KEGG website in a browser.

## Todo List
- [x] Phase 7: UI Polishing & Adaptation
    - [x] Create linear "Science Journey" navigation bar 🗺️
    - [x] Implement phase-aware `AIChatPanel` UI (Milestones, Skills)
    - [x] Refactor Agent Hub into unified [CHAT] and [ANALYZER] tabs 🔬
    - [x] Implement contextual "Instrument Bar" for skills and modules
    - [x] Remove redudant AI Assistant UI elements
- [ ] **Design & Planning**
    - [ ] Create implementation plan for backend search and KGML parsing
    - [ ] Define KGML to JSON mapping strategy
- [ ] **Backend Implementation (Python)**
    - [ ] Implement `search_pathway(query)` using KEGG REST API (`find/pathway`) <!-- id: 1 -->
    - [ ] Implement `fetch_pathway(pathway_id)` using KEGG REST API (`get/kgml`) <!-- id: 2 -->
    - [ ] Implement `KGML_to_JSON` parser <!-- id: 3 -->
        - [ ] Parse `<entry>` nodes for coordinates and names
        - [ ] Parse `<relation>` edges for interactions
        - [ ] Heuristic mapping for categories (or default to 'Gene')
    - [ ] Add `save_template` function to write JSON to storage <!-- id: 4 -->
- [ ] **Frontend Implementation (React)**
    - [ ] Add "Search Online" button/input to `TemplatePicker` <!-- id: 5 -->
    - [ ] Create modal/list to display search results <!-- id: 6 -->
    - [ ] Connect `search` and `download` actions to backend via Tauri command <!-- id: 7 -->
    - [ ] Refresh template list after download <!-- id: 8 -->
- [ ] **Verification**
    - [ ] Test searching for a common pathway (e.g., "Apoptosis")
    - [ ] Verify downloaded JSON structure matches existing templates
    - [ ] Verify visualization works with the new template
