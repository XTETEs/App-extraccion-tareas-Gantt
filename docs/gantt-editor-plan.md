# Interactive Gantt Chart Editor - Implementation Plan

## Goal

Add a new tab with an interactive Gantt chart where users can visually adjust task timelines by dragging bars in a calendar view.

---

## Library Selection

### ✅ Recommended: **SVAR React Gantt**

- **License:** MIT (100% free, open-source)
- **Features:**
  - Native React component
  - Comprehensive drag-and-drop (dates, duration, dependencies)
  - Fast performance with large datasets
  - Customizable task bars, grids, time scales
  - Modern, responsive UI
  - Active maintenance
- **Installation:** `npm install @svar/gantt`
- **Docs:** <https://svar.dev/react/gantt/overview>

### Alternative: **Frappe Gantt**

- Simpler, more lightweight
- Less features but easier to customize
- Good for basic needs

**Decision:** Use **SVAR React Gantt** for comprehensive features and better UX.

---

## Proposed Changes

### 1. New Dependencies

#### package.json

```json
{
  "dependencies": {
    "@svar/gantt": "^1.0.0"
  }
}
```

---

### 2. New Components

#### [NEW] src/components/GanttEditor.tsx

Interactive Gantt chart component with:

- Timeline visualization (year view)
- Drag-and-drop task bars
- Task editing (dates, duration)
- Save changes to backend
- Sync with existing task data

**Key features:**

- Transform `tasks` from store to SVAR Gantt format
- Handle drag events to update task dates
- Persist changes via new API endpoint
- Real-time sync across devices

---

### 3. Modified Components

#### [MODIFY] src/App.tsx

Add new "Editor" tab to navigation:

```tsx
<Tabs>
  <Tab>Dashboard</Tab>
  <Tab>Tareas</Tab>
  <Tab>Editor Gantt</Tab> {/* NEW */}
</Tabs>
```

Conditionally render `<GanttEditor />` when tab is active.

---

### 4. State Management

#### [MODIFY] src/store/useStore.ts

Add new actions:

- `updateTask(taskId, newDates)` - Update task dates
- `saveTaskUpdates()` - Persist to backend

---

### 5. Backend API

#### [NEW] api/update-tasks.js

Endpoint to save modified task data:

- Receives updated tasks array
- Stores in Redis (or creates new Blob with updated data)
- Returns success/error

**Approach:**

- Store task modifications in Redis as JSON
- When loading files, merge modifications with original data
- OR: Generate new Excel file with updated dates (more complex)

**Recommended:** Store modifications separately in Redis for simplicity.

---

## Data Flow

### Loading

1. User opens "Editor Gantt" tab
2. `GanttEditor` reads `tasks` from Zustand store
3. Transform to SVAR Gantt format:

```typescript
const ganttTasks = tasks.map(task => ({
  id: task.id,
  text: task.name,
  start_date: task.startDate,
  end_date: task.endDate,
  project: task.projectName,
  // ... other fields
}));
```

4. Render SVAR Gantt with data

### Editing

1. User drags task bar
2. SVAR fires `onTaskUpdate` event
3. Update Zustand store with new dates
4. Auto-save to backend (debounced)

### Persistence

1. POST to `/api/update-tasks` with modified tasks
2. Store in Redis: `task_modifications_${projectId}`
3. When loading files, merge modifications

---

## Verification Plan

### Automated Tests

- Unit tests for data transformation
- Integration test for save/load cycle

### Manual Verification

1. Open Editor tab
2. Drag task bar to new dates
3. Verify visual update
4. Reload page - verify changes persist
5. Open on another device - verify sync

---

## Implementation Steps

### Phase 1: Setup (30 min)

- [ ] Install `@svar/gantt`
- [ ] Create `GanttEditor.tsx` skeleton
- [ ] Add tab to `App.tsx`

### Phase 2: Data Integration (1 hour)

- [ ] Transform tasks to SVAR format
- [ ] Render basic Gantt chart
- [ ] Test with existing data

### Phase 3: Interactivity (1.5 hours)

- [ ] Implement drag handlers
- [ ] Update Zustand store on changes
- [ ] Add visual feedback

### Phase 4: Persistence (1 hour)

- [ ] Create `api/update-tasks.js`
- [ ] Implement save logic
- [ ] Test multi-device sync

### Phase 5: Polish (30 min)

- [ ] Add loading states
- [ ] Error handling
- [ ] UI refinements

**Total Estimated Time:** 4-5 hours

---

## User Review Required

> [!IMPORTANT]
> **Library Choice Confirmation**
>
> - SVAR React Gantt is MIT licensed (free forever)
> - Provides all requested features
> - Well-maintained and documented
>
> **Data Persistence Strategy**
>
> - Store modifications in Redis separately from original Excel files
> - Merge on load for display
> - Alternative: Generate new Excel files (more complex, slower)
>
> Please confirm this approach before implementation.

---

## Next Steps

1. User approval of plan
2. Install dependencies
3. Create `GanttEditor` component
4. Integrate with existing app
5. Test and deploy
