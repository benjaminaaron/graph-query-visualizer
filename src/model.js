import { onValidSparqlChange, setSparqlQuery } from './sparql-editor'
import { setGraphBuilderData, onValidGraphChange } from './graph-builder';
import { onEditorChange, setEditorValue } from "./language-interpreter";
import { extractWordFromUri } from "./utils";

const SparqlParser = require('sparqljs').Parser;
const parser = new SparqlParser();
const SparqlGenerator = require('sparqljs').Generator;
const generator = new SparqlGenerator({});

const Domain = {
    SPARQL: 1, GRAPH: 2, LANGUAGE: 3
};
let acceptingChanges = true; // to avoid changes triggering circular onChange-calls

const initModel = () => {
    onValidSparqlChange(data => acceptingChanges && translateToOtherDomains(Domain.SPARQL, data));
    onValidGraphChange(data => acceptingChanges && translateToOtherDomains(Domain.GRAPH, data));
    onEditorChange(data => acceptingChanges && translateToOtherDomains(Domain.LANGUAGE, data));

    let query = "PREFIX : <http://onto.de/default#>\n" +
        "SELECT * WHERE {\n" +
        "  ?sub :isA :Human ;\n" +
        "  \t:livesIn ?obj .\n" +
        "  ?obj :isA :city ;\n" +
        "  \t:locatedIn :Germany .\n" +
        "}";
    setSparqlQuery(query);
};

const translateToOtherDomains = (sourceDomain, data) => {
    acceptingChanges = false;
    switch (sourceDomain) {
        case Domain.SPARQL:
            let graph = buildGraphFromQuery(data);
            setGraphBuilderData(graph.prefixes, Object.values(graph.nodes), graph.edges);
            updateLanguageEditor(data, graph);
            break;
        case Domain.GRAPH:
            buildQueryFromGraph(data);
            setEditorValue("new value from GRAPH");
            break;
        case Domain.LANGUAGE:
            console.log("New value from editor to SPARQL and GRAPH: ", data);
            break;
    }
    acceptingChanges = true;
};

const buildGraphFromQuery = queryStr => {
    let queryJson = parser.parse(queryStr);
    let edges = [];
    let nodes = {};
    let queryType = queryJson.queryType;
    let variables = queryJson.variables.map(varObj => varObj.value);
    queryJson.where[0].triples.forEach(triple => {
        let subNode = addOrGetNode(nodes, triple.subject);
        let objNode = addOrGetNode(nodes, triple.object);
        edges.push({ id: edges.length, source: subNode.id, target: objNode.id, value: triple.predicate.value, type: triple.predicate.termType });
        // in this way from multiple same-direction edges between nodes, only one will be taken into account for computing the longest path
        // opposite-direction edges between same nodes lead to not-well defined behaviour as the alreadyOnPath-stopper kicks in, but not well defined TODO
        if (!subNode.children.includes(objNode)) {
            subNode.children.push(objNode);
        }
    });
    return { prefixes: queryJson.prefixes, nodes: nodes, edges: edges };
};

const addOrGetNode = (nodes, tripleEntity) => {
    let value = tripleEntity.value;
    if (!nodes[value]) {
        nodes[value] = { id: Object.keys(nodes).length, value: value, type: tripleEntity.termType, children: [] };
    }
    return nodes[value];
};

const buildQueryFromGraph = data => {
    let queryJson = {
        prefixes: data.prefixes,
        queryType: "SELECT",
        type: "query",
        variables: [{
            termType: "Wildcard",
            value: "*"
        }],
        where: [{
            type: "bgp",
            triples: data.triples
        }]
    };
    setSparqlQuery(generator.stringify(queryJson));
};

const updateLanguageEditor = (queryStr, graph) => {
    let queryJson = parser.parse(queryStr);
    let triples = queryJson.where[0].triples;
    triples.forEach(triple => triple.sharing = {});

    for (let a = 0; a < triples.length; a ++) {
        let tripleA = triples[a];
        setWord(tripleA.subject);
        setWord(tripleA.predicate);
        setWord(tripleA.object);
        for (let b = a + 1; b < triples.length; b ++) {
            let tripleB = triples[b];
            let subSame = tripleA.subject.value === tripleB.subject.value;
            let predSame = tripleA.predicate.value === tripleB.predicate.value;
            let objSame = tripleA.object.value === tripleB.object.value;
                // && tripleA.object.termType !== "Literal" && tripleB.object.termType !== "Literal";
            if (subSame && !predSame && !objSame) addSharingType(tripleA, tripleB, a, b,"sub");
            if (!subSame && predSame && !objSame) addSharingType(tripleA, tripleB, a, b,"pred");
            if (!subSame && !predSame && objSame) addSharingType(tripleA, tripleB, a, b,"obj");
            if (subSame && predSame && !objSame) addSharingType(tripleA, tripleB, a, b,"subPred");
            if (subSame && !predSame && objSame) addSharingType(tripleA, tripleB, a, b,"subObj");
            if (!subSame && predSame && objSame) addSharingType(tripleA, tripleB, a, b,"predObj");
        }
    }

    let longestPath = findLongestPath(graph.nodes);

    // TODO
    // setEditorValue(value);
};

const setWord = entity => {
    let value = entity.value;
    if (entity.termType === "NamedNode") {
        value = extractWordFromUri(value);
    }
    entity.word = value;
    entity.wordNormal = value.replace(/([A-Z])/g, " $1").toLowerCase(); // via stackoverflow.com/a/7225450/2474159
};

const findLongestPath = nodes => {
    let allPathsFromAllNodes = [];
    Object.values(nodes).forEach(node => {
        let allPathsFromThisNode = [];
        walkFromHere(node, [], allPathsFromThisNode);
        allPathsFromAllNodes.push.apply(allPathsFromAllNodes, allPathsFromThisNode);
    });
    return allPathsFromAllNodes.reduce((prev, current) => {
        return (prev.length > current.length) ? prev : current
    });
};


const walkFromHere = (node, path, allPaths) => {
    let alreadyOnPath = path.includes(node.value);
    path.push(node.value);
    if (alreadyOnPath || node.children.length === 0) {
        allPaths.push(path);
        return;
    }
    node.children.forEach(child => walkFromHere(child, path.slice(0), allPaths));
};

const addSharingType = (tripleA, tripleB, idxA, idxB, type) => {
    if (!tripleA.sharing[type]) tripleA.sharing[type] = [];
    if (!tripleB.sharing[type]) tripleB.sharing[type] = [];
    tripleA.sharing[type].push(idxB);
    tripleB.sharing[type].push(idxA);
};

export { initModel }
