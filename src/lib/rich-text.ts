import DOMPurify from "dompurify";
export function plainHtml(text = "") {
  return text.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!).replace(/\n/g, "<br>");
}
export function sanitizeComposeHtml(html: string) {
  if (typeof window === "undefined") return "";
  const safe = DOMPurify.sanitize(html, { ALLOWED_TAGS: ["p", "br", "strong", "b", "em", "i", "u", "s", "ul", "ol", "li", "blockquote", "a", "div", "span", "table", "tbody", "thead", "tr", "td", "th", "h1", "h2", "h3", "hr", "img"], ALLOWED_ATTR: ["href", "src", "alt", "title", "width", "height", "colspan", "rowspan", "style"], ALLOW_DATA_ATTR: false });
  const template = document.createElement("template"); template.innerHTML = safe;
  const styles = new Set(["color", "background-color", "font-size", "font-family", "font-weight", "font-style", "text-decoration", "text-align", "line-height", "border", "border-collapse", "padding", "margin", "width", "max-width"]);
  for (const element of template.content.querySelectorAll<HTMLElement>("*")) {
    if (element.hasAttribute("style")) {
      const entries = Array.from(element.style).filter(name => styles.has(name)).map(name => [name, element.style.getPropertyValue(name)]).filter(([, value]) => !/url\s*\(|expression\s*\(|@import|javascript:/i.test(value));
      element.removeAttribute("style");
      for (const [name, value] of entries) element.style.setProperty(name, value);
    }
    if (element.tagName === "A") {
      const href = element.getAttribute("href") || "";
      if (!/^(https?:|mailto:|tel:)/i.test(href)) element.removeAttribute("href");
      element.setAttribute("target", "_blank"); element.setAttribute("rel", "noopener noreferrer");
    }
    if (element.tagName === "IMG" && !/^(https:\/\/|data:image\/(png|jpeg|gif|webp);base64,)/i.test(element.getAttribute("src") || "")) element.remove();
  }
  return template.innerHTML;
}
export function htmlText(html: string) {
  const template = document.createElement("template"); template.innerHTML = sanitizeComposeHtml(html).replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|li|h[1-3]|tr)>/gi, "\n");
  return template.content.textContent?.replace(/\n{3,}/g, "\n\n").trim() || "";
}
export function inlineFiles(html: string) {
  const template = document.createElement("template"); template.innerHTML = sanitizeComposeHtml(html);
  const inline: { file: File; contentId: string }[] = [];
  for (const image of template.content.querySelectorAll("img")) {
    const match = image.src.match(/^data:(image\/(png|jpeg|gif|webp));base64,([A-Za-z0-9+/=]+)$/);
    if (!match) continue;
    const bytes = Uint8Array.from(atob(match[3]), c => c.charCodeAt(0));
    const name = `inline-${crypto.randomUUID()}.${match[2] === "jpeg" ? "jpg" : match[2]}`;
    const contentId = `${name}@frankiflow`;
    inline.push({ file: new File([bytes], name, { type: match[1] }), contentId });
    image.setAttribute("src", `cid:${contentId}`);
  }
  return { html: template.innerHTML, inline };
}
