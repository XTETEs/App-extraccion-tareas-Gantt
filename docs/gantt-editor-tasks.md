# Interactive Gantt Editor - Tasks

## Phase 1: Setup

- [ ] Install `@svar/gantt` dependency
- [ ] Create `src/components/GanttEditor.tsx` skeleton
- [ ] Add "Editor Gantt" tab to `App.tsx`
- [ ] Verify tab navigation works

## Phase 2: Data Integration

- [ ] Transform tasks from store to SVAR Gantt format
- [ ] Render basic Gantt chart with existing data
- [ ] Configure year view timeline
- [ ] Test with multiple projects

## Phase 3: Interactivity

- [ ] Implement `onTaskUpdate` handler for drag events
- [ ] Update Zustand store when tasks are modified
- [ ] Add visual feedback during drag
- [ ] Validate date changes (no negative durations)

## Phase 4: Persistence

- [ ] Create `api/update-tasks.js` endpoint
- [ ] Store task modifications in Redis
- [ ] Implement auto-save (debounced)
- [ ] Merge modifications on file load
- [ ] Test multi-device sync

## Phase 5: Polish

- [ ] Add loading states
- [ ] Error handling and user feedback
- [ ] UI refinements (colors, tooltips)
- [ ] Mobile responsiveness check
- [ ] Update CHANGELOG.md
