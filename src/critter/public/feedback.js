window.Feedback = {
  show(title, detail = '', kind = 'success') {
    const region = document.querySelector('#toast-region'); if (!region) return;
    const modal = ['copy-dialog', 'direct-dialog', 'authoring-dialog', 'unit-controls-dialog', 'ability-tools-dialog', 'mirror-review-dialog', 'mirror-end-dialog', 'editor-dialog'].map(id => document.getElementById(id)).find(d => d?.open);
    (modal || document.body).append(region); // Keep feedback above the active modal's backdrop.
    const node = document.createElement('section'); node.className = 'toast toast-' + kind;
    const heading = document.createElement('strong'); heading.textContent = title;
    const body = document.createElement('p'); body.textContent = detail;
    const close = document.createElement('button'); close.textContent = 'Dismiss'; close.onclick = () => node.remove();
    node.append(heading, body, close); region.append(node);
    // Keep one concise notification visible so feedback does not obscure controls.
    while (region.children.length > 1) region.firstChild.remove();
    if (kind !== 'error') setTimeout(() => node.remove(), 4500);
  }
};
