type PolyfillTarget = Node & {
	firstChild: ChildNode | null;
	parentNode: ParentNode | null;
	prepend?: (...els: Array<Node | string>) => void;
	replaceWith?: (...els: Array<Node | string>) => void;
};

function toNode(value: Node | string): Node {
	return typeof value === "string" ? document.createTextNode(value) : value;
}

const targets = [Element.prototype, Text.prototype] as PolyfillTarget[];

if (!("prepend" in Node.prototype)) {
	for (const target of targets) {
		target.prepend = function prepend(...els: Array<Node | string>) {
			for (let i = els.length - 1; i >= 0; i -= 1) {
				this.insertBefore(toNode(els[i]), this.firstChild);
			}
		};
	}
}

if (!Element.prototype.replaceWith) {
	for (const target of targets) {
		target.replaceWith = function replaceWith(...els: Array<Node | string>) {
			if (!this.parentNode) {
				return;
			}
			for (let i = 0; i < els.length; i += 1) {
				this.parentNode.insertBefore(toNode(els[i]), this);
			}
			this.parentNode.removeChild(this);
		};
	}
}
