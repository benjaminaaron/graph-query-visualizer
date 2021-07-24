import { buildGraph, updateGraphData } from './graph-shared';

// possible feature-rich alternative: https://github.com/wbkd/react-flow --> https://www.npmjs.com/package/react-flow-renderer

let graph;
let nodeIdCounter = 0, edgeIdCounter = 0;
let nodes = [], edges = [];
let prefixes = {};
let dragSourceNode = null, interimEdge = null;
const SNAP_IN_DISTANCE = 15;
const SNAP_OUT_DISTANCE = 40;

const setGraphBuilderData = (_prefixes, _nodes, _edges) => {
    nodes = _nodes;
    edges = _edges;
    prefixes = _prefixes;
    nodes.forEach(node => interpretFromModel(node));
    edges.forEach(edge => interpretFromModel(edge));
    nodeIdCounter = nodes.length;
    edgeIdCounter = edges.length;
    update();
};

const interpretFromModel = nodeOrEdge => {
    switch (nodeOrEdge.type) {
        case 'NamedNode':
            nodeOrEdge.label = buildShortFormIfPrefixExists(nodeOrEdge.value);
            nodeOrEdge.tooltip = nodeOrEdge.value;
            break;
        case 'Literal':
            nodeOrEdge.label = nodeOrEdge.value;
            nodeOrEdge.tooltip = null;
            break;
        case 'Variable':
            nodeOrEdge.label = "?" + nodeOrEdge.value;
            nodeOrEdge.tooltip = null;
            break;
    }
};

const buildShortFormIfPrefixExists = fullUri => {
    let ret = fullUri;
    Object.entries(prefixes).forEach(([short, uri]) => {
        if (fullUri.startsWith(uri)) {
            ret = short + ":" + fullUri.substr(uri.length);
        }
    });
    return ret;
};

const expandShortForm = shortForm => {
    let baseUri = prefixes[shortForm.split(':')[0]];
    return baseUri + (baseUri.endsWith("#") || baseUri.endsWith("/") ? "" : "#") + shortForm.split(':')[1];
};

const interpretInput = (nodeOrEdge, input) => {
    if (input.startsWith("?")) {
        nodeOrEdge.type = "Variable";
        nodeOrEdge.value = input.substr(1);
        nodeOrEdge.label = input;
        nodeOrEdge.tooltip = null;
        return nodeOrEdge;
    }
    if (input.startsWith("http")) {
        nodeOrEdge.type = "NamedNode";
        nodeOrEdge.value = input;
        nodeOrEdge.label = buildShortFormIfPrefixExists(input);
        nodeOrEdge.tooltip = input;
        return nodeOrEdge;
    }
    if (input.includes(":")) {
        nodeOrEdge.type = "NamedNode";
        let fullUri = expandShortForm(input);
        nodeOrEdge.value = fullUri;
        nodeOrEdge.label = input;
        nodeOrEdge.tooltip = fullUri;
        return nodeOrEdge;
    }
    // if we reach here, it must be a Literal
    nodeOrEdge.type = "Literal";
    nodeOrEdge.value = input;
    nodeOrEdge.label = input;
    nodeOrEdge.tooltip = null;
    return nodeOrEdge;
};

const prefixCreatedIfUnknownShortFormUsed = input => {
    if (input.startsWith("http") || !input.includes(":")) {
        return true;
    }
    let shortForm = input.split(":")[0];
    if (prefixes[shortForm]) {
        return true;
    }
    let fullUri = prompt("New prefix: which URI does " + shortForm + " stand for:", "http://onto.de/default/");
    if (!fullUri) {
        return false;
    }
    prefixes[shortForm] = fullUri;
    return true;
};

const update = () => {
    updateGraphData(graph, nodes, edges);
};

const distance = (node1, node2) => {
    return Math.sqrt(Math.pow(node1.x - node2.x, 2) + Math.pow(node1.y - node2.y, 2));
};

const getInput = (nodeOrEdge, type) => {
    let input = prompt('Set a value for this ' + type + ':', nodeOrEdge.label);
    if (!input) {
        return false;
    }
    if (!prefixCreatedIfUnknownShortFormUsed(input)) {
        return false;
    }
    interpretInput(nodeOrEdge, input);
    graphChanged();
    update();
    return true;
};

const setInterimEdge = (source, target) => {
    let edgeId = edgeIdCounter ++; // this raises the ID with every snapIn-snapOut, maybe find a less "Id-wasteful" approach? TODO
    interimEdge = { id: edgeId, source: source, target: target, label: '?pred' + edgeId, type: "IN_DRAGGING" };
    edges.push(interimEdge);
    update();
};

const removeEdge = edge => {
    edges.splice(edges.indexOf(edge), 1);
};

const removeInterimEdgeWithoutAddingIt = () => {
    removeEdge(interimEdge);
    interimEdge = null;
    update();
};

const removeNode = node => {
    edges.filter(edge => edge.source === node || edge.target === node).forEach(edge => removeEdge(edge));
    nodes.splice(nodes.indexOf(node), 1);
    graphChanged();
};

const initGraphBuilder = config => {
    graph = buildGraph(config)
        .onNodeDrag(dragNode => {
            dragSourceNode = dragNode;
            for (let node of nodes) {
                if (dragNode === node) {
                    continue;
                }
                // close enough: snap onto node as target for suggested edge
                if (!interimEdge && distance(dragNode, node) < SNAP_IN_DISTANCE) {
                    setInterimEdge(dragSourceNode, node);
                }
                // close enough to other node: snap over to other node as target for suggested edge
                if (interimEdge && node !== interimEdge.target && distance(dragNode, node) < SNAP_IN_DISTANCE) {
                    removeEdge(interimEdge);
                    setInterimEdge(dragSourceNode, node);
                }
            }
            // far away enough: snap out of the current target node
            if (interimEdge && distance(dragNode, interimEdge.target) > SNAP_OUT_DISTANCE) {
                removeInterimEdgeWithoutAddingIt();
            }
        })
        .onNodeDragEnd(() => {
            dragSourceNode = null;
            if (interimEdge && !getInput(interimEdge, "edge")) {
                removeEdge(interimEdge);
            }
            interimEdge = null;
            update();
        })
        .linkColor(edge => getColorForType(edge.type))
        .linkLineDash(edge => edge === interimEdge ? [2, 2] : [])
        .onNodeClick((node, event) => getInput(node, 'node'))
        .onNodeRightClick((node, event) => removeNode(node))
        .onLinkClick((edge, event) => getInput(edge, 'edge'))
        .onLinkRightClick((edge, event) => {
            removeEdge(edge);
            graphChanged();
        })
        .onBackgroundClick(event => {
            let coords = graph.screen2GraphCoords(event.layerX, event.layerY);
            let nodeId = nodeIdCounter ++;
            let node = { id: nodeId, x: coords.x, y: coords.y, label: '?var' + nodeId };
            if (getInput(node, "node")) {
                nodes.push(node);
                update();
            }
        })
        .nodeCanvasObject((node, ctx, globalScale) => {
            const fontSize = 14 / globalScale;
            ctx.font = `${fontSize}px Sans-Serif`;
            const textWidth = ctx.measureText(node.label).width;
            const rectDim = [textWidth, fontSize].map(n => n + fontSize * 0.8); // padding
            ctx.fillStyle = getColorForType(node === dragSourceNode || (interimEdge && (node === interimEdge.source || node === interimEdge.target)) ? 'IN_DRAGGING' : node.type);
            ctx.fillRect(node.x - rectDim[0] / 2, node.y - rectDim[1] / 2, ...rectDim);
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = 'white';
            ctx.fillText(node.label, node.x, node.y + fontSize * 0.1); // corrective factor to move text down a tiny bit within the rectangle
        });
        //.linkCanvasObjectMode(() => 'after')
        //.linkCanvasObject((edge, ctx) => {}) TODO
    update();
};

const getColorForType = type => {
    switch (type) {
        case 'NamedNode':
          return '#337a4d';
        case 'Literal':
          return '#912419';
        case 'IN_DRAGGING':
          return 'orange';
        case 'Variable':
        default:
          return 'rgba(31, 120, 180, 0.92)';
    }
    // ForceGraph default colors: edge = rgba(255,255,255,0.2), node = rgba(31, 120, 180, 0.92)
    // Yasgui editor colors: NamedNode #337a4d, Literal #912419, Variable #1d158b, curly brackets: #4aae23 (selected, otherwise black), keywords: #62167a
};

const graphChanged = () => {
    if (!graphChangeCallback) {
        return;
    }
    let triples = [];
    edges.forEach(edge => {
        triples.push({
            subject: {
                termType: edge.source.type,
                value: edge.source.value
            },
            predicate: {
                termType: edge.type,
                value: edge.value
            },
            object: {
                termType: edge.target.type,
                value: edge.target.value
            }
        });
    });

    // prune unused prefixes --> doesn't seem necessary, the editor drops them automatically
    // let allShortFormLabels = new Set(nodes.map(node => node.label).concat(edges.map(edge => edge.label))
    //    .filter(label => !label.startsWith("http") && label.includes(":")).map(shortLabel => shortLabel.split(":")[0]));
    // let unusedPrefixKeys = Object.keys(prefixes).filter(key => !allShortFormLabels.has(key));
    graphChangeCallback(prefixes, triples);
};

let graphChangeCallback;

const onValidGraphChange = callback => {
    graphChangeCallback = callback;
};

export { initGraphBuilder, setGraphBuilderData, onValidGraphChange }
