import * as vscode from 'vscode';
import * as path from 'path';
import rawHtml from './webview.html';


let previewers: Map<string, ZenumlPreviewer> = new Map();

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

	public getPerviewUri() {
		return this.previewUri;
	}

	public isZenUmlDocument(document: vscode.TextDocument) {
		return document.languageId === 'zenuml' && /^zenuml/.test(document.getText());
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
		if (this.previewUri != doc.uri.toString() && this.previewUri != null) {
			// this.lastDocument = doc;
			const previewer = previewers.get(this.previewUri);
			if (previewer === this) {
				previewers.delete(this.previewUri);
			}
			this.previewUri = doc.uri.toString();
			previewers.set(this.previewUri, this);
			this.webviewPanel.title = path.basename(doc.uri.fsPath) + '[Preview]';
		}
		this.webviewPanel.webview.html = this.createHtml(doc, this.webviewPanel.webview);
	}


	private onDidChangeTextEditorSelection(event: vscode.TextEditorSelectionChangeEvent): any {
	}

	private onDidChangeTextDocument(event: vscode.TextDocumentChangeEvent): any {
	}

	private onWebViewPanelDispose() {
		previewers.delete(this.previewUri!);
		this.webviewPanel = null;
	}

	private onDidReceiveMessage(e: any) {
		// TODO: handle message
	}

	public show(e?: any) {
		if (this.webviewPanel == null) {
			this.webviewPanel = vscode.window.createWebviewPanel(
				'zenuml-preview',
				'ZenUML Previewer',
				vscode.ViewColumn.Three,
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

	private createHtml(doc: vscode.TextDocument, webview: vscode.Webview): string {
		const documentText = doc.getText();
		// const html = rawHtml.replace(/{{content}}/ig, documentText);
		// console.log({
		// 	rawHtml,
		// 	html,
		// });
		const html = `
		<!DOCTYPE html>
<html lang="en">

<head>
	<meta charset="UTF-8">
	<meta http-equiv="X-UA-Compatible"
		content="IE=edge">
	<meta name="viewport"
		content="width=device-width, initial-scale=1.0">
	<title>Document</title>
	<script src="https://unpkg.com/vue@2.6.14"></script>
	<script src="https://unpkg.com/@zenuml/core@2.0.1/dist/zenuml/core.umd.min.js"></script>
	<link rel="stylesheet"
		href="https://unpkg.com/@zenuml/core@2.0.1/dist/zenuml/core.css">
</head>


<body>
	<div id="app">
	</div>
	<script>
		const ZenUml = window['zenuml/core'].default;
		const zenuml = new ZenUml(document.getElementById('app'));
		const code = \`${documentText}\`;
		zenuml.render(code, 'theme-blue')
	</script>

</body>

</html>
		`;
		console.log(html);
		return html;
	}

	dispose() {
		this.disposal.dispose();
	}
}


function onDidChangeActiveTextEditor(e: vscode.TextEditor | undefined, show?: boolean) {
	console.debug('onDidChangeActiveTextEditor', e, show);
	if (e && e.document && e.document.languageId === 'zenuml') {
		let previewer = getPreviewerBy(e.document.uri);
		if (!previewer) {
			previewer = new ZenumlPreviewer();
			previewers.set(e.document.uri.toString(), previewer);
		}

		if (previewer) {
			if (e.document.uri.toString() !== previewer.getPerviewUri()) {
				previewer.show(e.document.uri);
			}
		}
	}
}

function getPreviewerBy(uri: vscode.Uri) {
	return previewers.get(uri.toString());
}

function getUnlockedController() {
	for (let controller of previewers.values()) {
		if (!controller.isLocked) {
			return controller;
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
		vscode.commands.registerCommand('vscode-zenuml.preview', () => preview()),
	);
}