# Improve Filter Sidebar Styling & Add Toggle

## Context

After the layout fix, the filter sidebar uses `border-l pl-6` which creates an incomplete-looking divider. The sidebar content floats without a proper container. The user wants proper shadcn/ui styling and a toggle to hide filters for more table space.

**Why not shadcn Sidebar?** The app already uses it for the navigation sidebar (`AppSidebar` in `app-shell.tsx`). The component uses fixed viewport positioning, a shared cookie, and a single keyboard shortcut — nesting another instance would create conflicts. Card is the correct shadcn primitive for a contained content panel.

## Files to Change

### `web/src/components/transactions/transactions-table.tsx`

**1. Add `filtersOpen` state**

```tsx
const [filtersOpen, setFiltersOpen] = useState(true);
```

**2. Make filter button toolbar always visible**

Current button row has `lg:hidden` (mobile only). Change to always-visible toolbar with breakpoint-specific buttons:

```tsx
<div className="flex shrink-0 items-center gap-2">
  {/* Mobile: opens sheet */}
  <Button variant="outline" size="sm" className="gap-2 lg:hidden" onClick={() => setMobileFiltersOpen(true)} data-qa="btn-filters">
    <Filter className="h-4 w-4" />
    Filters
    {activeFilterCount > 0 && <Badge ...>{activeFilterCount}</Badge>}
  </Button>

  {/* Desktop: toggles sidebar */}
  <Button variant="outline" size="sm" className="hidden gap-2 lg:inline-flex" onClick={() => setFiltersOpen((prev) => !prev)} data-qa="btn-toggle-filters">
    {filtersOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
    {filtersOpen ? "Hide filters" : "Show filters"}
    {!filtersOpen && activeFilterCount > 0 && <Badge ...>{activeFilterCount}</Badge>}
  </Button>

  {activeFilterCount > 0 && (
    <Button variant="ghost" size="sm" onClick={handleClearFilters} className="gap-1" data-qa="btn-clear-filters-mobile">
      <X className="h-4 w-4" /> Clear
    </Button>
  )}
</div>
```

Add `PanelRightClose`, `PanelRightOpen` to lucide-react imports.

**3. Wrap sidebar in Card, conditionally render**

Replace:
```tsx
<aside className="hidden w-[260px] shrink-0 self-stretch overflow-y-auto border-l pl-6 lg:block">
  <TransactionFiltersSidebar {...sidebarProps} />
</aside>
```

With:
```tsx
{filtersOpen && (
  <aside className="hidden w-[280px] shrink-0 lg:block">
    <Card className="h-full overflow-hidden py-4">
      <CardContent className="flex-1 overflow-y-auto px-4">
        <TransactionFiltersSidebar {...sidebarProps} />
      </CardContent>
    </Card>
  </aside>
)}
```

Card provides `rounded-xl border bg-card shadow-sm` — proper visual containment. Internal scroll on CardContent keeps border/corners intact. Reduced padding (`py-4 px-4`) to fit the 280px width.

**4. Add imports**

```tsx
import { Card, CardContent } from "@/components/ui/card";
// Add PanelRightClose, PanelRightOpen to lucide-react import
```

### No other files change

- `transaction-filters-sidebar.tsx` — unchanged
- `page.tsx` — unchanged
- Mobile sheet — unchanged

## Verification

1. `just dev-restart web`
2. Navigate to `/transactions`
3. Verify: sidebar has proper Card styling (rounded, border, shadow, background)
4. Click "Hide filters" → sidebar disappears, table takes full width
5. Click "Show filters" → sidebar reappears with Card styling
6. Badge shows active filter count on toggle button when sidebar is hidden
7. Resize to mobile → sheet-based filters still work
8. Other pages unaffected
