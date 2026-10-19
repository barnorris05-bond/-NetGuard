#include <iostream>
#include <vector>
#include <string>
#include <unordered_map>
#include <queue>
#include <algorithm>
#include <iomanip>
#include <limits>

using namespace std;

// Class representing a Network Topology using an Adjacency List
class NetworkGraph {
private:
    int numVertices;
    unordered_map<string, int> nameToIndex;
    vector<string> indexToName;
    vector<vector<int>> adjList;
    vector<bool> activeVertices; // To simulate device failures
    vector<pair<int, int>> failedLinks;

public:
    NetworkGraph() : numVertices(0) {}

    // Add a device (Vertex)
    void addDevice(const string& name) {
        if (nameToIndex.find(name) == nameToIndex.end()) {
            nameToIndex[name] = numVertices;
            indexToName.push_back(name);
            adjList.push_back(vector<int>());
            activeVertices.push_back(true);
            numVertices++;
        }
    }

    // Add a physical bidirectional link (Undirected Edge)
    void addLink(const string& u, const string& v) {
        if (nameToIndex.find(u) == nameToIndex.end() || nameToIndex.find(v) == nameToIndex.end()) return;
        int uIdx = nameToIndex[u];
        int vIdx = nameToIndex[v];

        if (uIdx == vIdx || find(adjList[uIdx].begin(), adjList[uIdx].end(), vIdx) != adjList[uIdx].end()) {
            return;
        }

        adjList[uIdx].push_back(vIdx);
        adjList[vIdx].push_back(uIdx);
    }

    // Simulate Device Failure
    void failDevice(const string& name) {
        auto device = nameToIndex.find(name);
        if (device == nameToIndex.end()) {
            cout << "\nDevice '" << name << "' was not found.\n";
            return;
        }

        int idx = device->second;
        if (!activeVertices[idx]) {
            cout << "\nDevice '" << name << "' is already DOWN.\n";
            return;
        }

        activeVertices[idx] = false;
        cout << "\n[SIMULATION] Device '" << name << "' HAS FAILED (DOWN).\n";
    }

    // Restore Device
    void restoreDevice(const string& name) {
        auto device = nameToIndex.find(name);
        if (device == nameToIndex.end()) {
            cout << "\nDevice '" << name << "' was not found.\n";
            return;
        }

        int idx = device->second;
        if (activeVertices[idx]) {
            cout << "\nDevice '" << name << "' is already UP.\n";
            return;
        }

        activeVertices[idx] = true;
        cout << "\n[SIMULATION] Device '" << name << "' HAS BEEN RESTORED (UP).\n";
    }

    // Simulate Link Failure
    void failLink(const string& u, const string& v) {
        auto uDevice = nameToIndex.find(u);
        auto vDevice = nameToIndex.find(v);
        if (uDevice == nameToIndex.end() || vDevice == nameToIndex.end()) {
            cout << "\nCannot fail link: one or both devices were not found.\n";
            return;
        }

        int uIdx = uDevice->second;
        int vIdx = vDevice->second;
        if (find(adjList[uIdx].begin(), adjList[uIdx].end(), vIdx) == adjList[uIdx].end()) {
            cout << "\nNo active link exists between '" << u << "' and '" << v << "'.\n";
            return;
        }

        auto removeEdge = [](vector<int>& vec, int target) {
            vec.erase(remove(vec.begin(), vec.end(), target), vec.end());
        };

        removeEdge(adjList[uIdx], vIdx);
        removeEdge(adjList[vIdx], uIdx);
        failedLinks.push_back({min(uIdx, vIdx), max(uIdx, vIdx)});
        cout << "\n[SIMULATION] Link between '" << u << "' and '" << v << "' HAS FAILED (CUT).\n";
    }

    // Restore a failed physical link
    void restoreLink(const string& u, const string& v) {
        auto uDevice = nameToIndex.find(u);
        auto vDevice = nameToIndex.find(v);
        if (uDevice == nameToIndex.end() || vDevice == nameToIndex.end()) {
            cout << "\nCannot restore link: one or both devices were not found.\n";
            return;
        }

        int uIdx = uDevice->second;
        int vIdx = vDevice->second;
        if (uIdx == vIdx) {
            cout << "\nA device cannot have a link to itself.\n";
            return;
        }
        const pair<int, int> link = {min(uIdx, vIdx), max(uIdx, vIdx)};
        auto failedLink = find(failedLinks.begin(), failedLinks.end(), link);
        if (failedLink == failedLinks.end()) {
            cout << "\nNo failed link exists between '" << u << "' and '" << v << "'.\n";
            return;
        }
        if (find(adjList[uIdx].begin(), adjList[uIdx].end(), vIdx) != adjList[uIdx].end()) {
            cout << "\nLink between '" << u << "' and '" << v << "' is already UP.\n";
            return;
        }

        adjList[uIdx].push_back(vIdx);
        adjList[vIdx].push_back(uIdx);
        failedLinks.erase(failedLink);
        cout << "\n[SIMULATION] Link between '" << u << "' and '" << v << "' HAS BEEN RESTORED.\n";
    }

    // Print Adjacency List Structure
    void printAdjacencyList() const {
        cout << "\n======================================================\n";
        cout << "            NETWORK ADJACENCY LIST STRUCTURE          \n";
        cout << "======================================================\n";
        for (int i = 0; i < numVertices; ++i) {
            cout << left << setw(18) << indexToName[i] 
                 << (activeVertices[i] ? "[UP]   " : "[DOWN] ") << " -> ";
            
            if (!activeVertices[i]) {
                cout << "(Device Inactive)\n";
                continue;
            }

            bool first = true;
            for (int neighbor : adjList[i]) {
                if (activeVertices[neighbor]) {
                    if (!first) cout << ", ";
                    cout << indexToName[neighbor];
                    first = false;
                }
            }
            if (first) cout << "EMPTY (Isolated Node)";
            cout << "\n";
        }
        cout << "======================================================\n";
    }

    // 1. BFS Reachability & Alternate Path Finding: O(V + E)
    void analyzeReachabilityBFS(const string& startNode, const string& targetNode) const {
        cout << "\n--- [ALGORITHM] BFS Reachability Analysis ---\n";
        if (nameToIndex.find(startNode) == nameToIndex.end() || nameToIndex.find(targetNode) == nameToIndex.end()) {
            cout << "Cannot compute path: source or destination device was not found.\n";
            return;
        }

        int src = nameToIndex.at(startNode);
        int dest = nameToIndex.at(targetNode);

        if (!activeVertices[src] || !activeVertices[dest]) {
            cout << "Cannot compute path: Either source or destination is DOWN.\n";
            return;
        }

        vector<bool> visited(numVertices, false);
        vector<int> parent(numVertices, -1);
        queue<int> q;

        q.push(src);
        visited[src] = true;

        while (!q.empty()) {
            int curr = q.front();
            q.pop();

            if (curr == dest) break;

            for (int neighbor : adjList[curr]) {
                if (activeVertices[neighbor] && !visited[neighbor]) {
                    visited[neighbor] = true;
                    parent[neighbor] = curr;
                    q.push(neighbor);
                }
            }
        }

        if (!visited[dest]) {
            cout << "STATUS: NO PATH EXISTS between " << startNode << " and " << targetNode << "!\n";
        } else {
            cout << "STATUS: PATH FOUND!\nPath Hops: ";
            vector<int> path;
            for (int at = dest; at != -1; at = parent[at]) path.push_back(at);
            reverse(path.begin(), path.end());

            for (size_t i = 0; i < path.size(); ++i) {
                cout << indexToName[path[i]] << (i == path.size() - 1 ? "" : " -> ");
            }
            cout << " (Total Hops: " << path.size() - 1 << ")\n";
        }
    }

    // 2. Connected Components Analysis: O(V + E)
    void findConnectedComponents() const {
        cout << "\n--- [ALGORITHM] Connected Components (Network Islands) ---\n";
        vector<bool> visited(numVertices, false);
        int componentCount = 0;

        for (int i = 0; i < numVertices; ++i) {
            if (!visited[i] && activeVertices[i]) {
                componentCount++;
                cout << "Subnetwork Group " << componentCount << ": { ";
                
                queue<int> q;
                q.push(i);
                visited[i] = true;

                while (!q.empty()) {
                    int curr = q.front();
                    q.pop();
                    cout << indexToName[curr] << " ";

                    for (int neighbor : adjList[curr]) {
                        if (activeVertices[neighbor] && !visited[neighbor]) {
                            visited[neighbor] = true;
                            q.push(neighbor);
                        }
                    }
                }
                cout << "}\n";
            }
        }
        cout << "Total Active Subnetworks: " << componentCount << "\n";
    }

    // Helper DFS for Tarjan's Bridge and Articulation Point detection
    void tarjanDFS(int u, vector<int>& disc, vector<int>& low, vector<int>& parent, 
               vector<pair<string, string>>& bridges, vector<string>& ap, int& time) const {
        disc[u] = low[u] = ++time;
        int children = 0;
        bool isAP = false;

        for (int v : adjList[u]) {
            if (!activeVertices[v]) continue;

            if (disc[v] == -1) { // If v is not visited
                children++;
                parent[v] = u;
                tarjanDFS(v, disc, low, parent, bridges, ap, time);

                low[u] = min(low[u], low[v]);

                // Articulation Point Condition 1: Root with 2+ children
                if (parent[u] == -1 && children > 1) isAP = true;

                // Articulation Point Condition 2: Non-root where low[v] >= disc[u]
                if (parent[u] != -1 && low[v] >= disc[u]) isAP = true;

                // Bridge Condition: low[v] > disc[u]
                if (low[v] > disc[u]) {
                    bridges.push_back({indexToName[u], indexToName[v]});
                }
            } else if (v != parent[u]) {
                low[u] = min(low[u], disc[v]);
            }
        }

        if (isAP) ap.push_back(indexToName[u]);
    }

    // 3. Vulnerability Analysis (Critical Links and Devices): O(V + E)
    void analyzeVulnerabilities() const {
        cout << "\n--- [ALGORITHM] Critical Vulnerability Detection (Tarjan's) ---\n";
        vector<int> disc(numVertices, -1);
        vector<int> low(numVertices, -1);
        vector<int> parent(numVertices, -1);
        vector<pair<string, string>> bridges;
        vector<string> articulationPoints;
        int time = 0;

        for (int i = 0; i < numVertices; ++i) {
            if (activeVertices[i] && disc[i] == -1) {
                tarjanDFS(i, disc, low, parent, bridges, articulationPoints, time);
            }
        }

        cout << "Critical Devices (Articulation Points - Failure isolates network):\n";
        if (articulationPoints.empty()) cout << "  None (High Redundancy)\n";
        else for (const auto& node : articulationPoints) cout << "  [!] " << node << "\n";

        cout << "Critical Links (Bridges - Cut isolates network):\n";
        if (bridges.empty()) cout << "  None (High Redundancy)\n";
        else for (const auto& bridge : bridges) cout << "  [!] " << bridge.first << " <---> " << bridge.second << "\n";
    }
};

// Seed 10-Device Sample Topology
void buildSampleTopology(NetworkGraph& net) {
    vector<string> devices = {
        "Core_Router", "Dist_Router_1", "Dist_Router_2", 
        "Switch_A", "Switch_B", "Switch_C", 
        "Web_Server", "Db_Server", "Admin_PC", "User_PC"
    };

    for (const auto& dev : devices) net.addDevice(dev);

    net.addLink("Core_Router", "Dist_Router_1");
    net.addLink("Core_Router", "Dist_Router_2");
    net.addLink("Dist_Router_1", "Switch_A");
    net.addLink("Dist_Router_1", "Switch_B");
    net.addLink("Dist_Router_2", "Switch_C");
    net.addLink("Switch_A", "Web_Server");
    net.addLink("Switch_B", "Db_Server");
    net.addLink("Switch_C", "Admin_PC");
    net.addLink("Switch_C", "User_PC");
    net.addLink("Switch_A", "Switch_B"); // Redundant Link
}

int main() {
    NetworkGraph net;
    buildSampleTopology(net);

    int choice;
    do {
        cout << "\n========== NETGUARD: GRAPH NETWORK RELIABILITY SYSTEM ==========\n";
        cout << "1. Display Network Topology (Adjacency List)\n";
        cout << "2. Analyze Current Vulnerabilities (Bridges & Articulation Points)\n";
        cout << "3. Find Path Between Devices (BFS)\n";
        cout << "4. Simulate Device Failure\n";
        cout << "5. Simulate Link Failure\n";
        cout << "6. Restore Device State\n";
        cout << "7. View Connected Components (Subnetworks)\n";
        cout << "8. Run Full Before vs After Reliability Demo\n";
        cout << "9. Restore Link\n";
        cout << "0. Exit\n";
        cout << "Enter your choice: ";
        if (!(cin >> choice)) {
            if (cin.eof()) break;
            cin.clear();
            cin.ignore(numeric_limits<streamsize>::max(), '\n');
            cout << "Invalid input. Enter a menu number.\n";
            continue;
        }

        switch (choice) {
            case 1:
                net.printAdjacencyList();
                break;
            case 2:
                net.analyzeVulnerabilities();
                break;
            case 3: {
                string src, dest;
                cout << "Enter Source Device and Destination Device: ";
                if (!(cin >> src >> dest)) {
                    if (!cin.eof()) {
                        cin.clear();
                        cin.ignore(numeric_limits<streamsize>::max(), '\n');
                        cout << "Invalid device input.\n";
                    }
                    break;
                }
                net.analyzeReachabilityBFS(src, dest);
                break;
            }
            case 4: {
                string dev;
                cout << "Enter Device to Fail: ";
                if (!(cin >> dev)) break;
                net.failDevice(dev);
                break;
            }
            case 5: {
                string u, v;
                cout << "Enter Link Endpoint 1 and Endpoint 2: ";
                if (!(cin >> u >> v)) {
                    if (!cin.eof()) {
                        cin.clear();
                        cin.ignore(numeric_limits<streamsize>::max(), '\n');
                        cout << "Invalid device input.\n";
                    }
                    break;
                }
                net.failLink(u, v);
                break;
            }
            case 6: {
                string dev;
                cout << "Enter Device to Restore: ";
                if (!(cin >> dev)) break;
                net.restoreDevice(dev);
                break;
            }
            case 7:
                net.findConnectedComponents();
                break;
            case 8: {
                NetworkGraph demoNet = net;
                cout << "\n======================================================\n";
                cout << "      DEMO: BEFORE VS AFTER FAILURE ANALYSIS          \n";
                cout << "======================================================\n";
                
                cout << "\n>>> STAGE 1: HEALTHY NETWORK METRICS <<<\n";
                demoNet.printAdjacencyList();
                demoNet.analyzeVulnerabilities();
                demoNet.analyzeReachabilityBFS("Admin_PC", "Web_Server");

                cout << "\n>>> STAGE 2: SIMULATING CRITICAL FAILURE <<<\n";
                demoNet.failDevice("Dist_Router_1"); // Critical device cut

                cout << "\n>>> STAGE 3: POST-FAILURE RE-ANALYSIS <<<\n";
                demoNet.printAdjacencyList();
                demoNet.findConnectedComponents();
                demoNet.analyzeReachabilityBFS("Admin_PC", "Web_Server");
                cout << "\nLive network state is unchanged by the demo.\n";
                break;
            }
            case 9: {
                string u, v;
                cout << "Enter Link Endpoint 1 and Endpoint 2: ";
                if (!(cin >> u >> v)) {
                    if (!cin.eof()) {
                        cin.clear();
                        cin.ignore(numeric_limits<streamsize>::max(), '\n');
                        cout << "Invalid device input.\n";
                    }
                    break;
                }
                net.restoreLink(u, v);
                break;
            }
            case 0:
                cout << "Exiting NetGuard System.\n";
                break;
            default:
                cout << "Invalid Option!\n";
        }
    } while (choice != 0);

    return 0;
}