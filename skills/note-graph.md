---
name: note-graph
description: Visualize the knowledge graph of notes. Shows an interactive graph with nodes (notes) and edges (links between notes). Supports filtering by tags and folder paths.
version: 1.0.0
---

# Note Graph Visualization

When the user invokes `/note-graph`, display an interactive knowledge graph visualization using the canvas.

## Usage

```
/note-graph                    # Full vault graph
/note-graph knowledge/         # Graph of a specific folder
/note-graph --tag mcp          # Filter by tag
```

## Instructions

1. **Fetch graph data** by calling the `get_graph` tool from the notes MCP server:
   - If a path argument is provided, pass it to `get_graph(path: "...")`
   - Otherwise, call `get_graph(path: ".")` for the full vault

2. **Parse the response** - the tool returns JSON with:
   - `nodes`: Array of `{ id, path, tags }`
   - `edges`: Array of `{ from, to, type }`
   - `summary`: Statistics about the graph

3. **Update the canvas component** at `d:\quill-mcp\canvas\note-graph.canvas.tsx`:
   - Replace the `sampleGraphData` constant with the actual graph data from step 1
   - Keep the component structure the same

4. **Show the canvas** - the user will see the interactive graph in the Canvas preview panel

## Canvas Features

- **Interactive nodes**: Click to select and see details
- **Tag filtering**: Click tag buttons to filter the graph
- **Zoom controls**: +/- buttons to zoom in/out
- **Edge types**: Solid lines = wiki links, dashed lines = markdown links
- **Node colors**: Based on primary tag
- **Details panel**: Shows selected node's path, tags, and connection count

## Example Output

The canvas will render an SVG-based force-directed graph with:
- Nodes as colored circles (color based on tags)
- Edges as lines connecting nodes
- Labels showing note names
- Interactive selection and filtering

## Notes

- The graph uses a force-directed layout algorithm for automatic positioning
- Large graphs (>100 nodes) may benefit from filtering by folder or tag
- The visualization is read-only - to modify notes, use other notes MCP tools
