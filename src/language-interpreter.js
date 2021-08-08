import CodeMirror from "codemirror";
import {} from "codemirror/addon/mode/simple";

let editor;
let keywords = { NamedNode: [], Variable: [], Literal: [] };

CodeMirror.defineSimpleMode("sparqlTermTypes", {
    start: [{
        regex: /\w+/, token: match => {
            if (keywords.NamedNode.includes(match[0].toLowerCase())) {
                return 'namedNodeShort';
            }
            if (keywords.Variable.includes(match[0].toLowerCase())) {
                return 'variable';
            }
            if (keywords.Literal.includes(match[0].toLowerCase())) {
                return 'literal';
            }
            return 'word'
        }}]
});

const initLanguageInterpreter = config => {
    config.div.style.border = "1px solid silver";
    editor = CodeMirror(config.div, {
        value: "some text in line one.\none some text in the second line.",
        mode:  "sparqlTermTypes",
        readOnly: true,
        lineWrapping: true
    });
};

const parseSentences = () => {
    let tokens = [];
    for (let i = 0; i < editor.getDoc().lineCount(); i ++) {
        tokens = [...tokens, ...editor.getLineTokens(i).filter(token => token.string.trim())];
    }
    let sentences = [];
    let oneSentence = [];
    tokens.forEach(token => {
        if (token.string === ".") {
            sentences.push(oneSentence);
            oneSentence = [];
        } else {
            oneSentence.push(token.string);
        }
    });
    if (oneSentence.length > 0) { // no dot at all or dangling words in the end without closing with a dot
        sentences.push(oneSentence);
    }
    return sentences;
};

const setEditorValue = (value, _keywords = { NamedNode: [], Variable: [], Literal: [] }) => {
    keywords = _keywords;
    editor.setValue(value);
};

const onEditorChange = onChange => {
    // editor.on("change", () => onChange(parseSentences()));
    editor.on("keyup", (obj, event) => {
        if (event.key !== "Enter") {
            alert("Translating the natural language domain to the SPARQL and graph domain is not supported yet... or ever. Quite tough to get this right I imagine :)")
        }
    });
};

export { initLanguageInterpreter, onEditorChange, setEditorValue }
