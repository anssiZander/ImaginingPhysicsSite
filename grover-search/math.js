// Keep authored TeX readable in the HTML and serve KaTeX and its fonts locally.
// HTML + MathML gives visual typesetting and semantic math for assistive tools.
let mathErrors = 0;
renderMathInElement(document.querySelector('article'), {
  delimiters: [
    {left: '\\[', right: '\\]', display: true},
    {left: '\\(', right: '\\)', display: false}
  ],
  ignoredTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code', 'option', 'svg'],
  output: 'htmlAndMathml',
  throwOnError: true,
  trust: false,
  errorCallback: (message, error) => {
    mathErrors++;
    console.error(message, error);
  }
});
document.documentElement.dataset.mathReady = mathErrors ? 'error' : 'true';
