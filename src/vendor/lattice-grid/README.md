# Vendored: lattice-grid

Copied from https://github.com/michaelinman28/lattice-grid at commit
`4fdab332d2b88023b101a8995421da97d3f8b27b` (version 1.5.0). The library is plain
JavaScript with no build step and defines a global `LatticeGrid` class.

To update, copy `lattice-grid.js` and `lattice-grid.css` from the repo over these
files. Use it in React through `src/components/LatticeGrid.tsx`.

## Local changes

Patched here (marked `movieproduction patch` in `lattice-grid.js`); worth upstreaming:

- `treeColumnField` option: with `treeData`, makes the tree column editable as that
  field of each row (used for task titles).

- **`filterSplit`** (column option, with `filter: 'set'`): for a column whose value is a
  list such as `"Director, Gaffer"`, give the separator (`','`). The dropdown filter then
  lists each item on its own, and a row matches when any of its items is ticked.
