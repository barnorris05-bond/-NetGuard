# NetGuard – Viva Demonstration Script (10 minutes)

> Companion document: [EXAMINER_README.md](EXAMINER_README.md) (problem statement, graph mapping, complexity tables).
> Live demo: `npm run dev`, then open <http://localhost:5173>. Production build: `npm run build && npm start` → <http://localhost:4000>.

## 1. Introduction (30–45 seconds)

> "My project is **NetGuard — Graph-Based Network Reliability Analysis**. It answers one question: *if a device or a cable fails, does the network stay connected, and which elements are single points of failure?*
>
> The network is modelled as an **undirected graph**: devices are vertices and cables are edges. I store it as an **adjacency list** — a `Map<string,int>` from device name to index, plus a `vector<vector<int>>`-style array of neighbour indices — because a campus network is **sparse**: `E ≈ V`, not `E ≈ V²`. This representation gives `O(V + E)` memory and lets BFS and Tarjan traverse the graph in linear time. The simulator is a TypeScript port of my original C++ `NetworkGraph` class, so the algorithmic logic is unchanged."

Point at the sidebar: "Vertex = device, edge = link, bridge = critical cable, articulation point = critical device, connected component = isolated island."

---

## 2. Live Demonstration Flow (step-by-step)

### Step 1: Show the Adjacency List (Healthy Network)

**UI action:** open the **Topology** tab; the *Adjacency List* panel on the left is always visible. Click `Switch_C` to select it.

**What to say:**

- "Each row is one vertex: its index, its name, its degree, and the list of devices it is directly cabled to."
- "`Switch_C` has index 5 and neighbours `Dist_Router_2`, `Admin_PC`, `User_PC` — so `adjList[5] = [2, 8, 9]`. The relationship is **symmetric**: `Dist_Router_2` also lists `Switch_C`. Ten links produce twenty adjacency entries."
- "The sample topology has **10 devices, 10 links, 1 connected component** — a three-tier design: one core router, two distribution routers, three access switches, and four endpoints."
- "The redundant `Switch_A ↔ Switch_B` cable is deliberate: it is a cycle, and cycles are what remove bridges."

**Terminal equivalent (optional):**

```bash
curl -s http://localhost:4000/api/graph
```

Show `adjacency[5].neighbors` and `metrics`.

> **If the examiner asks to see the queue:** switch to **Step Trace**, choose **BFS path**, and step through `Admin_PC → Web_Server` with **Next**. The right-hand panels show the FIFO queue, the visited order, and every `parent[]` assignment; the current vertex pulses cyan and queued vertices are dashed amber.

### Step 2: BFS Path Finding

**UI action:** **Path Finder** tab → Source `Admin_PC`, Destination `Web_Server` → **Find shortest path** → **Play**.

**What to say:**

- "BFS uses a FIFO queue, a `visited[]` flag array, and a `parent[]` array."
- "Result: `Admin_PC → Switch_C → Dist_Router_2 → Core_Router → Dist_Router_1 → Switch_A → Web_Server`, **6 hops**."
- "Why shortest? BFS removes vertices in non-decreasing distance order. The first time the destination is dequeued, it has been reached by the fewest possible edges, and walking `parent[]` backwards reconstructs that route."
- "Each vertex is enqueued once and each adjacency entry is scanned once, so the cost is `O(V + E)` — linear, not quadratic."

```bash
curl -s -X POST http://localhost:4000/api/path \
  -H 'Content-Type: application/json' \
  -d '{"source":"Admin_PC","destination":"Web_Server"}'
```

### Step 3: Vulnerability Analysis (Tarjan)

**UI action:** **Vulnerability** tab → **Run analysis**. Point at the red halos and pulsing links.

**What to say:**

- "One DFS computes `disc[]` (discovery timestamp) and `low[]` (lowest discovery timestamp reachable through the subtree, using at most one back edge)."
- "A link `u–v` is a **bridge** when `low[v] > disc[u]`; a non-root vertex `u` is an **articulation point** when some child satisfies `low[v] >= disc[u]`, and the DFS root is one when it has more than one child."
- "Result on the sample: **6 articulation points** — `Core_Router`, `Dist_Router_1`, `Dist_Router_2`, `Switch_A`, `Switch_B`, `Switch_C` — and **7 bridges**. The endpoints (`Web_Server`, `Db_Server`, `Admin_PC`, `User_PC`) are leaves, so they are never articulation points: losing a leaf isolates nobody else."
- "`Dist_Router_1` is the clearest critical device — both access switches hang off it. `Switch_A ↔ Web_Server` is a clear critical cable — the web server has exactly one path into the network."
- "The `Switch_A ↔ Switch_B` cable is **not** a bridge: it is the extra edge in the only cycle, and it is exactly the redundancy that protects the two access switches."

```bash
curl -s http://localhost:4000/api/vulnerabilities
```

### Step 4: Failure Simulation

**UI action:** **Failure Sim** tab → fail device `Dist_Router_1`.

**What to say:**

- "A device failure sets `activeVertices[idx] = false`. The adjacency list is **retained** — this matches the C++ implementation — but every traversal skips inactive vertices, so traffic cannot pass *through* the failed router either."
- "This is not the same as deleting the vertex: the physical wiring is still recorded, which is what makes restoration possible."
- "Metrics change to **9 active devices**, and the adjacency rows for `Core_Router`, `Switch_A`, and `Switch_B` now mark `Dist_Router_1` as a down neighbour — the cable is still drawn, but no traversal may cross it."

Then open **Components**:

- "**2 connected components**, of 5 and 4 devices: `{Core_Router, Dist_Router_2, Switch_C, Admin_PC, User_PC}` and `{Switch_A, Switch_B, Web_Server, Db_Server}`."

Then back to **Path Finder** and re-run `Admin_PC → Web_Server`:

- "`found: false` — the route is broken. The packet animation switches to the *Signal lost* state, and the visited set shows the search never left the Admin-side island."

```bash
curl -s -X POST http://localhost:4000/api/devices/Dist_Router_1/fail
curl -s http://localhost:4000/api/components
```

### Step 5: Restoration & Recovery

**UI action:** **Failure Sim** → restore `Dist_Router_1` (or **Restore all**). Re-run components and the path.

**What to say:**

- "Restoration sets the flag back to `true`. Because the adjacency list was never destroyed, the graph returns to **1 component** and the 6-hop path is found again."
- "A **link** failure behaves differently: `failLink()` physically erases the neighbour index from *both* adjacency lists, and `restoreLink()` re-inserts it at both ends. A link catalog keeps the cut edge so it can be drawn, listed, and restored."
- "The **History** tab records every failure, restore, and BFS query, and can export JSON, CSV, or PDF for the report appendix."

```bash
curl -s -X POST http://localhost:4000/api/devices/Dist_Router_1/restore
```

**Closing line:** "The same engine therefore supports reachability, criticality, partition detection, and recovery — all in `O(V + E)` per operation."

---

## 3. Viva Q&A Section (Mandatory)

### 1. Why did you choose an Adjacency List instead of an Adjacency Matrix for this network?

The sample network has `V = 10` devices and `E = 10` links, so it is **sparse** (`E ≪ V²`). An adjacency matrix would allocate `V² = 100` cells to store only `2E = 20` non-zero entries, wasting roughly 80% of the structure; at campus scale (`V = 500`) that becomes 250,000 cells versus about 1,000 list entries. The list stores exactly `O(V + E)` integers, and both BFS and Tarjan iterate only over real neighbours, giving `O(V + E)` instead of `O(V²)`. The trade-off is that edge lookup is `O(deg(v))` rather than `O(1)`; for reliability analysis, where we always traverse whole neighbourhoods, that trade is clearly favourable. A matrix would only win on a dense graph, where `E ≈ V²`.

### 2. How does Tarjan's algorithm detect Articulation Points using `disc[]` and `low[]` values in O(V + E) time?

A single DFS timestamps each vertex on first visit: `disc[u]` is its discovery counter, and `low[u]` is the smallest `disc` reachable from `u`'s subtree using tree edges plus at most one back edge. After recursing into child `v`, we set `low[u] = min(low[u], low[v])`. A **bridge** exists when `low[v] > disc[u]`, because the subtree cannot reach `u` or anything older without that edge. A non-root `u` is an **articulation point** when `low[v] >= disc[u]` for some child — that subtree can only reconnect through `u` — while the DFS root is one only if it has **two or more** children. Since every vertex and edge is processed once, the total cost is `O(V + E)`, and the arrays need `O(V)` space.

### 3. How are device failures and link failures simulated in the Adjacency List? What happens to the data structure?

A **device failure** flips `activeVertices[i]` to `false`. The adjacency entries are deliberately kept, mirroring the C++ `failDevice()`; BFS, components, and Tarjan simply skip inactive vertices and any neighbour behind them. A **link failure** is a structural change: `failLink(u, v)` removes `v` from `adjList[u]` and `u` from `adjList[v]`, so the edge no longer exists in the traversal structure. The link catalog keeps a record with `active = false` so the UI can still draw the cut cable and restore it by pushing both indices back. Restoration therefore re-adds at most two integers and one boolean; no full rebuild is needed, and indices are never reused or shifted.

### 4. What is the difference between a Bridge and an Articulation Point in the context of network reliability?

A **bridge** is an *edge* whose removal increases the number of connected components — a single cable whose loss splits the network (`low[v] > disc[u]`). An **articulation point** is a *vertex* whose removal does the same — a device whose failure isolates part of the network. They are related but independent: two cycles joined at one shared router give an articulation point with **no** incident bridge, whereas a bridge between a switch and a leaf server has only one endpoint that is an articulation point (the leaf is not). In this topology the graph is nearly a tree with one cycle, so each articulation point does border at least one bridge, but that is a property of the sample, not a theorem. Practically, bridges argue for redundant cabling, while articulation points argue for redundant routing hardware.

### 5. Why is the time complexity of all major operations O(V + E)?

All three algorithms are **linear graph traversals**. BFS marks each vertex when enqueued, so every vertex enters the queue once and every adjacency entry is examined once — for an undirected adjacency list that is `2E` entries, hence `O(V + E)`. Connected components is the same BFS flood fill started once per unvisited vertex: vertices are partitioned, so the total work is still `O(V + E)`. Tarjan is a single DFS with constant work per vertex and per edge, plus `O(V)` array initialisation. Memory is `O(V + E)` for the list itself and `O(V)` auxiliary for the queue, `visited`, `parent`, `disc`, and `low`. The only place a naive implementation could degrade is edge lookup, which is `O(deg(v))` in a list, adding only a constant factor to a full traversal.

### 6. What happens if we fail a non-critical leaf device versus a core router?

Failing a **leaf** such as `Web_Server` or `User_PC` removes that endpoint and its single cable from the reachable graph, but the component count stays the same: the rest of the network never depended on it. The BFS to that host fails while every other route still works, and Tarjan reports no new articulation points. Failing a **core router** such as `Dist_Router_1` removes a vertex that all paths to the access layer must pass through, so the surviving graph splits into two components (5 and 4 devices) and the Admin → Web route becomes unreachable. This is exactly the difference between *local impact* and *global impact*, and it is why the analysis reports articulation points rather than just degrees.

### 7. How would the system behave on a complete graph (fully connected) versus a linear chain?

On a **complete graph** `Kₙ`, every pair of devices is directly linked, so `E = n(n−1)/2`; the adjacency list is dense, memory grows to `O(n²)`, and a matrix becomes competitive. Reliability is maximal: there are **no bridges and no articulation points**, BFS returns a 1-hop path for any pair, and any single failure leaves the graph connected. On a **linear chain**, `E = n−1`; there are `n−1` bridges, every internal vertex is an articulation point, BFS distance can be `n−1` hops, and **any** single device or link failure splits the network into two components. The contrast is the core lesson: connectivity under failure is governed by cycles, which is why the redundant `Switch_A ↔ Switch_B` link changes the vulnerability profile of the sample topology.

---

## 4. Two-Minute Backup Plan (if the live UI is unavailable)

```bash
npm test          # 58 engine + trace + API tests, prints each scenario name
npm run build     # TypeScript build, zero errors
```

Then show the JSON endpoints with `curl` (`/api/graph`, `/api/path`, `/api/vulnerabilities`, `/api/components`) and the expected numbers: 6-hop path, 6 articulation points, 7 bridges, 2 components after failing `Dist_Router_1`.

---

## 5. Likely Follow-up Traps and One-Line Defences

| Question | Defence |
| --- | --- |
| "Why not just count links per node?" | Degree finds *hubs*, not *cut vertices*: `Switch_A` has degree 3 yet is critical, while a vertex inside a dense cycle can have high degree and no criticality at all. |
| "Why is BFS not Dijkstra?" | All links have unit cost (hop count), so BFS's FIFO order already produces shortest paths in `O(V + E)`, cheaper than a heap-based Dijkstra. |
| "What if a device is isolated but active?" | It is still a vertex: it forms its own component of size 1 and is reported as such. |
| "Why does the adjacency list keep a failed device?" | Physical topology versus reachable topology: retaining the vertex lets the UI show and restore the hardware, while `activeVertices` governs traversal. |
| "Is Tarjan run per query?" | Yes, on demand — one linear DFS is cheaper than maintaining dynamic connectivity structures for this project's scale. |
