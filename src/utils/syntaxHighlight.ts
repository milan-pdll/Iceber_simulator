/**
 * Syntax highlighter helper for JSON
 */
export function syntaxHighlightJson(json: string): string {
  if (!json) return '';
  json = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return json.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
    function (match) {
      let cls = 'text-amber-300'; // number
      if (/^"/.test(match)) {
        if (/:$/.test(match)) {
          cls = 'text-sky-400 font-medium'; // key
        } else {
          cls = 'text-emerald-300'; // string
        }
      } else if (/true|false/.test(match)) {
        cls = 'text-purple-400'; // boolean
      } else if (/null/.test(match)) {
        cls = 'text-rose-400'; // null
      }
      return '<span class="' + cls + '">' + match + '</span>';
    }
  );
}
