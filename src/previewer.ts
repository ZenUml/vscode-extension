import * as vscode from 'vscode';
import * as path from 'path';
import {themes} from './themes';


let previewers: Map<string, ZenumlPreviewer> = new Map();

interface PreviewConfig {
	autoRefresh: boolean;
	theme: keyof typeof themes;
}

const defaultConfig: PreviewConfig = {
	autoRefresh: true,
	theme: 'default'
};


function getPreviewConfiguration() {
	return vscode.workspace.getConfiguration('zenuml').get<PreviewConfig>('preview', defaultConfig);
}

export class ZenumlPreviewer implements vscode.Disposable {
	private previewUri?: string;
	private webviewPanel?: vscode.WebviewPanel | null;
	private disposal: vscode.Disposable;
	public isLocked: boolean = false;
	public static $context: vscode.ExtensionContext;

	constructor() {
		this.disposal = vscode.workspace.onDidChangeTextDocument(e => this.onDidChangeTextDocument(e));
	}

	public isActive() {
		return this.webviewPanel && this.webviewPanel.visible;
	}

	public isActiveBy(doc: vscode.TextDocument) {
		return this.isActive() && doc.uri.toString() === this.previewUri;
	}

	public getPerviewUri() {
		return this.previewUri;
	}

	public isZenUmlDocument(document: vscode.TextDocument) {
		return document.languageId === 'zenuml' && /^zenuml/.test(document.getText());
	}

	public show(e?: any) {
		// eslint-disable-next-line eqeqeq
		if (this.webviewPanel == null) {
			const column = vscode.window.visibleTextEditors.length ? vscode.ViewColumn.Beside : vscode.ViewColumn.Two;
			this.webviewPanel = vscode.window.createWebviewPanel(
				'zenuml-preview',
				'ZenUML Previewer',
				{
					viewColumn: column,
					preserveFocus: true
				},
				{
					enableScripts: true,
					retainContextWhenHidden: true,
				}
			);
			this.webviewPanel.webview.onDidReceiveMessage(e => this.onDidReceiveMessage(e));
			this.webviewPanel.onDidDispose(() => this.onWebViewPanelDispose());
		}

		if (!this.webviewPanel.visible) {
			this.webviewPanel.reveal(vscode.ViewColumn.Three, true);
		}

		let docUri: vscode.Uri | null = null;
		if (e instanceof vscode.Uri) {
			docUri = e;
		}
		else if (vscode.window.activeTextEditor) {
			docUri = vscode.window.activeTextEditor.document.uri;
		}

		if (docUri) {
			vscode.workspace.openTextDocument(docUri).then(doc => this.showDocument(doc));
		}
	}

	private showUri(uri: vscode.Uri) {
		vscode.workspace.openTextDocument(uri).then(doc => {
			this.showDocument(doc);
		});
	}

	private async showDocument(doc: vscode.TextDocument) {
		if (!this.webviewPanel) {
			return;
		}
		if (this.previewUri !== doc.uri.toString()) {
			// this.lastDocument = doc;
			if (this.previewUri) {
				const previewer = previewers.get(this.previewUri);
				if (previewer === this) {
					previewers.delete(this.previewUri);
				}
			}
			this.previewUri = doc.uri.toString();
			previewers.set(this.previewUri, this);
			this.webviewPanel.title = path.basename(doc.uri.fsPath) + '[Preview]';
		}
		this.webviewPanel.webview.html = this.createHtml(doc, this.webviewPanel.webview);
	}


	private onDidChangeTextEditorSelection(e: vscode.TextEditorSelectionChangeEvent): any {
		if (this.isActiveBy(e.textEditor.document) && e.selections.length === 1) {
			let selection = e.selections[0];
			let offset = e.textEditor.document.offsetAt(selection.active);
			this.webviewPanel!.webview.postMessage({
				action: 'selection',
				offset
			});
		}
	}

	private onDidChangeTextDocument(e: vscode.TextDocumentChangeEvent): any {
		if (e.document.uri.toString() === this.previewUri) {
			this.showDocument(e.document);
		}
		return;
	}

	private onWebViewPanelDispose() {
		previewers.delete(this.previewUri!);
		this.webviewPanel = null;
	}

	private onDidReceiveMessage(e: any) {
		// TODO: handle message
	}

	private getNonce() {
		let text = '';
		const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
		for (let i = 0; i < 32; i++) {
			text += possible.charAt(Math.floor(Math.random() * possible.length));
		}
		return text;
	}

	private createHtml(doc: vscode.TextDocument, webview: vscode.Webview): string {
		const extensionUri = ZenumlPreviewer.$context.extensionUri;
		const scriptPathOnDisk = vscode.Uri.joinPath(extensionUri, "dist", "zenuml.js");
		const scriptSrc = webview.asWebviewUri(scriptPathOnDisk);
		const content = doc.getText();
		const nonce = this.getNonce();
		const previewConfig  = getPreviewConfiguration();
		const theme = themes[previewConfig.theme];


		const html = `
<!DOCTYPE html>
<html lang="en">

<head>
	<meta charset="UTF-8">
	<meta http-equiv="X-UA-Compatible"
		content="IE=edge">
	<meta name="viewport"
		content="width=device-width, initial-scale=1.0">
	<meta http-equiv="Content-Security-Policy"
		content="default-src 'none'; img-src vscode-resource: https:; script-src 'nonce-${nonce}'; style-src vscode-resource: 'unsafe-inline' http: https: data:;">
	<title>ZenUML Diagram</title>
	<script nonce="${nonce}"> window.process = { env: 'production' } </script>
	<script nonce="${nonce}" src="${scriptSrc}"></script>	
</head>
<body>
	<noscript>You need to enable Javascript to run this app.</noscript>
	<div id="app"></div>
	<script nonce="${nonce}">
		const ZenUml = window['zenuml'].default;
		const zenuml = new ZenUml(document.getElementById('app'));
		const code = \`${content}\`;

		zenuml.render(code, {
			theme: \`${theme}\`,
			mode: 'static',
		})
	</script>
</body>

</html>
		`;

		return html;
	}

	dispose() {
		this.disposal.dispose();
	}
}

function onDidChangeActiveTextEditor(e: vscode.TextEditor | undefined, show?: boolean) {
	if (e && e.document && e.document.languageId === 'zenuml') {
		let previewer = getPreviewerBy(e.document.uri);
		if (!previewer) {
			previewer = new ZenumlPreviewer();
			previewers.set(e.document.uri.toString(), previewer);
		}

		if (previewer) {
			if (e.document.uri.toString() !== previewer.getPerviewUri()) {
				previewer.show(e.document.uri);
			} else if (!previewer.isActive()) {
				previewer.show();
			}
		}
	}
}

function getPreviewerBy(uri: vscode.Uri) {
	return previewers.get(uri.toString());
}

function getUnlockedPreviewer() {
	for (let previewer of previewers.values()) {
		if (!previewer.isLocked) {
			return previewer;
		}
	}
	return null;
}

function preview(e?: any) {
	if (e) {
		const uri = <vscode.Uri>e;
		vscode.workspace.openTextDocument(uri).then(doc => {
			onDidChangeActiveTextEditor(vscode.window.activeTextEditor, true);
		});
		return;
	}

	const editor = vscode.window.activeTextEditor;
	if (editor) {
		onDidChangeActiveTextEditor(editor, true);
	}
}

export function registerPreviewers(context: vscode.ExtensionContext) {
	ZenumlPreviewer.$context = context;
	ZenumlPreviewer.$context.subscriptions.push(
		vscode.window.onDidChangeActiveTextEditor(e => onDidChangeActiveTextEditor(e)),
		vscode.commands.registerTextEditorCommand('vscode-zenuml.preview', () => preview()),
	);
}