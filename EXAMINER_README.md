# NetGuard – Examiner Documentation
## Network Reliability Analysis via Graph Theory

> Companion document: [VIVA_SCRIPT.md](VIVA_SCRIPT.md) (10-minute live demonstration script and model answers).

---

### 1. Academic Problem Statement

Computer networks are designed to carry traffic between arbitrary endpoints, yet their physical topology is rarely uniform: some devices and cables are *cut elements* whose loss partitions the network, while others are protected by redundancy. This project addresses the problem of **quantifying network reliability from topology alone**, without packet-level simulation. The campus network is modelled as an undirected, unweighted graph `G = (V, E)`, where each vertex is a device (router, switch, server, or workstation) and each edge is a bidirectional physical or logical link. Devices may be marked *down* and links *cut* to simulate failures, after which the system answers four questions in `O(V + E)` time: (i) is there a route between two devices, and what is the fewest-hop path; (ii) how many disconnected subnetworks (connected components) survive; (iii) which devices are articulation points, and which cables are bridges; and (iv) does restoring an element recover the original connectivity. The graph is represented using an **adjacency list**, mirroring the original C++ `NetworkGraph` implementation, and exposed through a REST API and an interactive visual interface.

---

### 2. Graph Theory Mapping Table (Mandatory)

| Real-World Network Concept       | Graph Theory Concept              | Symbol |
|----------------------------------|-----------------------------------|--------|
| Device (Router / Switch / PC)    | Vertex                            | V      |
| Physical / Logical Cable         | Undirected Edge                   | E      |
| Critical Device (failure isolates network) | Articulation Point         | AP     |
| Critical Cable (failure isolates network)  | Bridge                       | —      |
| Isolated group of devices        | Connected Component               | —      |
| Route a packet can take          | Path                              | —      |

**Supplementary mapping used in the implementation**

| Implementation Element | Graph-Theoretic Role |
| --- | --- |
| `nameToIndex : Map<string, number>` | Dense vertex numbering `0 … V−1` for array-based algorithms |
| `adjList : number[][]` | Adjacency list: `adjList[u]` = indices of vertices adjacent to `u` |
| `activeVertices : boolean[]` | Vertex-induced subgraph after simulated failures |
| Link catalog `{u, v, active}` | Edge set with an `active` predicate for cut/restore |
| BFS queue + `parent[]` | Level-order traversal and shortest-path reconstruction tree |

---

### 3. Data Structure Justification

**Why an adjacency list was chosen.** The target networks are sparse: the reference topology has `V = 10`, `E = 10`, and even a realistic access network keeps `E` within a small constant factor of `V`. An adjacency list stores exactly `2E` neighbour indices, so memory is `O(V + E)`. An adjacency matrix would allocate `V²` cells, of which only `2E` are non-zero; for `V = 1,000` and `E = 1,200` that is 1,000,000 cells against 2,400 entries — roughly 400× waste. Traversal cost follows the same pattern: iterating the row of a list costs `O(deg(v))` and summed over all vertices gives `O(V + E)`, whereas scanning a matrix row costs `O(V)` and a full sweep `O(V²)`.

**Space complexity comparison for sparse networks.**

| Representation | Space | Edge lookup | Full traversal | Add vertex | Add edge |
| --- | --- | --- | --- | --- | --- |
| Adjacency list | `O(V + E)` | `O(deg(v))` | `O(V + E)` | `O(1)` amortised | `O(1)` |
| Adjacency matrix | `O(V²)` | `O(1)` | `O(V²)` | `O(V)` rebuild | `O(1)` |

The list's only weakness — non-constant edge lookup — is irrelevant here, because every operation in the system (BFS, component scan, Tarjan DFS) traverses complete neighbour sets. The implementation therefore accepts the `O(deg(v))` lookup in exchange for linear memory and linear traversal.

**Mutation semantics during fail/restore operations.**

- **Device failure (`failDevice`)** sets `activeVertices[i] = false`. The vertex and all its adjacency entries are **retained**, matching the reference C++ behaviour. Traversals test the flag before visiting, so a down device and everything reachable only through it are excluded from reachable paths. This distinguishes *physical topology* (what is cabled) from *reachable topology* (what is up), and makes restoration a single boolean write.
- **Device restore (`restoreDevice`)** sets the flag back to `true`; connectivity is recomputed on demand by the next query, so no cached structure can go stale.
- **Link failure (`failLink`)** is structural: `v` is erased from `adjList[u]` and `u` from `adjList[v]`, i.e. the edge is removed from the graph while the link catalog keeps `{u, v, active = false}` for display and restoration.
- **Link restore (`restoreLink`)** pushes both indices back into the two adjacency lists and flips the catalog flag to `true`.
- **Additions** append a new index and neighbour entry; vertex indices are never reused or shifted, so stored references remain valid for the lifetime of the graph.

---

### 4. Algorithms Implemented & Complexity

| Algorithm                  | Purpose in Network Context              | Time Complexity | Space Complexity |
|---------------------------|-----------------------------------------|-----------------|------------------|
| BFS                       | Reachability & fewest-hop path          | O(V + E)        | O(V)             |
| DFS / Connected Components| Detect network partitions               | O(V + E)        | O(V)             |
| Tarjan (Bridges + APs)    | Find single points of failure           | O(V + E)        | O(V)             |

**Implementation detail.**

1. **BFS shortest path** — a FIFO queue, a `visited[]` array, and a `parent[]` array. Vertices are dequeued in non-decreasing hop distance, so the first time the destination is reached the path uses the fewest edges; it is reconstructed by walking `parent[]` backwards. Inactive vertices are never enqueued, so failures are handled inside the traversal rather than by rebuilding the graph.
2. **Connected components** — the same flood fill started from every unvisited active vertex. The number of flood fills equals the number of surviving subnetworks; inactive devices are reported separately rather than silently merged.
3. **Tarjan bridges and articulation points** — one DFS maintaining `disc[u]` (discovery time) and `low[u]` (lowest discovery time reachable from the subtree using at most one back edge). Bridge: `low[v] > disc[u]`. Non-root articulation point: `low[v] >= disc[u]` for some child. Root articulation point: two or more DFS children. Each edge is examined once, so the analysis is linear.

Memory note: the adjacency list itself occupies `O(V + E)`; the auxiliary arrays above occupy `O(V)`. The overall complexity of every operation is therefore `O(V + E)` time and space.

---

### 5. Sample Topology Description

The seeded topology is a reduced three-tier campus network of **10 devices and 10 links**, identical to the topology constructed by `buildSampleTopology()` in the reference C++ program.

| Tier | Devices |
| --- | --- |
| Core | `Core_Router` |
| Distribution | `Dist_Router_1`, `Dist_Router_2` |
| Access | `Switch_A`, `Switch_B`, `Switch_C` |
| Endpoints | `Web_Server`, `Db_Server`, `Admin_PC`, `User_PC` |

**Links:** `Core_Router ↔ Dist_Router_1`, `Core_Router ↔ Dist_Router_2`, `Dist_Router_1 ↔ Switch_A`, `Dist_Router_1 ↔ Switch_B`, `Dist_Router_2 ↔ Switch_C`, `Switch_A ↔ Web_Server`, `Switch_B ↔ Db_Server`, `Switch_C ↔ Admin_PC`, `Switch_C ↔ User_PC`, plus the redundant `Switch_A ↔ Switch_B` link.

**Why it contains both redundant and critical elements.**

- The `Switch_A ↔ Switch_B` link closes the only cycle `Dist_Router_1 → Switch_A → Switch_B → Dist_Router_1`. That cycle protects the two access switches: with it in place, neither `Dist_Router_1 ↔ Switch_A` nor `Dist_Router_1 ↔ Switch_B` is a bridge. Removing the redundant link raises the bridge count from **7 to 9**, which is a direct, observable demonstration of the value of redundancy.
- The network is otherwise a tree, so the spine remains fragile: `Core_Router`, both distribution routers, and all three switches are articulation points (**6**). Failing `Dist_Router_1` partitions the network into components of **5** and **4** devices and breaks the `Admin_PC → Web_Server` route.
- The four endpoints are leaves, so no endpoint is an articulation point even though each is reached by a bridge. This gives a clean contrast between *bridge* (edge criticality) and *articulation point* (vertex criticality).
- On the healthy topology, BFS finds a **6-hop** path from `Admin_PC` to `Web_Server`, and the graph has **1** connected component.

---

### 6. Expected Learning Outcomes

A student presenting this project is expected to demonstrate the following.

1. **Modelling competence** — translate a real network into `G = (V, E)`, justify undirected unweighted edges, and explain the mapping between physical components and graph primitives.
2. **Data-structure reasoning** — justify the adjacency list over the adjacency matrix using actual `V`, `E`, and sparsity arguments, including the `O(deg(v))` lookup trade-off.
3. **Algorithmic understanding** — explain BFS parent reconstruction, component flood fill, and Tarjan's `disc[]`/`low[]` invariants, and derive `O(V + E)` time and `O(V)` auxiliary space for each.
4. **Failure semantics** — articulate the difference between vertex deletion (flag-based, structural retention) and edge deletion (adjacency removal with a restore catalog), and explain why retaining failed devices is useful.
5. **Reliability interpretation** — distinguish bridges from articulation points, distinguish local (leaf) impact from global (cut-vertex) impact, and interpret component counts as surviving subnetworks.
6. **Redundancy argument** — use the `Switch_A ↔ Switch_B` cycle to show quantitatively how an added edge removes bridges and protects the access layer.
7. **Engineering verification** — demonstrate that the implementation is tested against known-good topologies (chain, ring, star, disconnected, complete graph, sample network) and that all algorithms agree with manual expectations.

---

### 7. Implementation and Verification Reference

| Artefact | Location |
| --- | --- |
| Graph engine (adjacency list, BFS, components, Tarjan) | [server/src/graph.ts](server/src/graph.ts) |
| Shared types and sample topology | [server/src/types.ts](server/src/types.ts) |
| Persistence, history, clone-safe demo | [server/src/store.ts](server/src/store.ts) |
| REST API factory and routes | [server/src/app.ts](server/src/app.ts), [server/src/index.ts](server/src/index.ts) |
| Algorithm suite | [server/src/graph.test.ts](server/src/graph.test.ts) |
| Step-trace engine (read-only projection) | [server/src/trace.ts](server/src/trace.ts) |
| Step-trace suite | [server/src/trace.test.ts](server/src/trace.test.ts) |
| HTTP integration suite | [server/src/api.test.ts](server/src/api.test.ts) |
| Original C++ reference implementation | [Mini_project.cpp](Mini_project.cpp) |

Verification commands:

```bash
npm test          # 58 tests: 32 graph-engine + 14 algorithm-trace + 12 HTTP integration scenarios
npm run typecheck # strict TypeScript, client and server
npm run build     # production build, zero errors
```

The engine suite covers adjacency-list structure, isolated and disconnected graphs, chain/ring/star/redundant topologies, failure and restoration (device, link, simultaneous, duplicate, unknown), BFS correctness, Tarjan correctness, component counting, traversal invariants, and clone isolation. The HTTP suite runs the real Express application against a temporary persistence file, so it never modifies the development state.

Known-good reference values for the healthy sample graph:

| Property | Value |
| --- | --- |
| Devices / links | 10 / 10 |
| Adjacency entries | 20 (undirected, both directions) |
| Connected components | 1 |
| Articulation points | 6 |
| Bridges | 7 |
| `Admin_PC → Web_Server` | 6 hops |
| Components after failing `Dist_Router_1` | 2 (sizes 5 and 4) |
| Bridges after cutting `Switch_A ↔ Switch_B` | 9 |
