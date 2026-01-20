import axios, { AxiosInstance } from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import FormData from 'form-data';

/**
 * Parses inline formatting (bold, italic, strikethrough, code, links) in a text string
 * Returns an array of ADF text nodes with appropriate marks
 */
function parseInlineFormatting(text: string): any[] {
  const result: any[] = [];
  let currentPos = 0;

  // Combined regex that captures all inline formatting
  // Order matters: links, code, bold, italic, strikethrough
  const regex = /(\[([^\]]+)\]\(([^)]+)\)|`([^`]*)`|\*\*([^*]+)\*\*|__([^_]+)__|~~([^~]+)~~|\*([^*]+)\*|_([^_]+)_)/g;

  let match;
  while ((match = regex.exec(text)) !== null) {
    // Add any plain text before this match
    if (match.index > currentPos) {
      const plainText = text.substring(currentPos, match.index);
      if (plainText) {
        result.push({
          type: 'text',
          text: plainText,
        });
      }
    }

    // Determine what type of formatting was matched
    if (match[1] && match[2] && match[3]) {
      // Link: [text](url)
      result.push({
        type: 'text',
        text: match[2],
        marks: [
          {
            type: 'link',
            attrs: {
              href: match[3],
            },
          },
        ],
      });
    } else if (match[4] !== undefined) {
      // Inline code: `text`
      result.push({
        type: 'text',
        text: match[4],
        marks: [{ type: 'code' }],
      });
    } else if (match[5]) {
      // Bold: **text**
      result.push({
        type: 'text',
        text: match[5],
        marks: [{ type: 'strong' }],
      });
    } else if (match[6]) {
      // Bold: __text__
      result.push({
        type: 'text',
        text: match[6],
        marks: [{ type: 'strong' }],
      });
    } else if (match[7]) {
      // Strikethrough: ~~text~~
      result.push({
        type: 'text',
        text: match[7],
        marks: [{ type: 'strike' }],
      });
    } else if (match[8]) {
      // Italic: *text*
      result.push({
        type: 'text',
        text: match[8],
        marks: [{ type: 'em' }],
      });
    } else if (match[9]) {
      // Italic: _text_
      result.push({
        type: 'text',
        text: match[9],
        marks: [{ type: 'em' }],
      });
    }

    currentPos = match.index + match[0].length;
  }

  // Add any remaining plain text
  if (currentPos < text.length) {
    const plainText = text.substring(currentPos);
    if (plainText) {
      result.push({
        type: 'text',
        text: plainText,
      });
    }
  }

  // If no formatting was found, return the original text
  if (result.length === 0) {
    result.push({
      type: 'text',
      text: text,
    });
  }

  return result;
}

/**
 * Converts plain text to Atlassian Document Format (ADF)
 * Preserves line breaks, code blocks, and basic formatting including:
 * - Bold (**text** or __text__)
 * - Italic (*text* or _text_)
 * - Strikethrough (~~text~~)
 * - Inline code (`code`)
 * - Links ([text](url))
 * - Headings (# H1, ## H2, etc.)
 */
function textToADF(text: string): any {
  const lines = text.split('\n');
  const content: any[] = [];
  let inCodeBlock = false;
  let codeBlockLines: string[] = [];
  let codeLanguage = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Handle code blocks (```language or ```)
    if (line.trim().startsWith('```')) {
      if (!inCodeBlock) {
        // Starting a code block
        inCodeBlock = true;
        codeLanguage = line.trim().substring(3).trim();
        codeBlockLines = [];
      } else {
        // Ending a code block
        inCodeBlock = false;
        content.push({
          type: 'codeBlock',
          attrs: codeLanguage ? { language: codeLanguage } : {},
          content: [
            {
              type: 'text',
              text: codeBlockLines.join('\n'),
            },
          ],
        });
        codeBlockLines = [];
        codeLanguage = '';
      }
      continue;
    }

    // Collect lines inside code block
    if (inCodeBlock) {
      codeBlockLines.push(line);
      continue;
    }

    // Skip empty lines - JIRA will handle spacing between elements automatically
    if (line.trim() === '') {
      continue;
    }

    // Handle headings (# H1, ## H2, etc.)
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const headingText = headingMatch[2];
      content.push({
        type: 'heading',
        attrs: { level },
        content: parseInlineFormatting(headingText),
      });
      continue;
    }

    // Handle bullet lists (lines starting with -, *, or •)
    if (line.trim().match(/^[-*•]\s/)) {
      const listItem = line.trim().substring(2);
      // Check if we need to create a new list or add to existing
      if (content.length > 0 && content[content.length - 1].type === 'bulletList') {
        content[content.length - 1].content.push({
          type: 'listItem',
          content: [
            {
              type: 'paragraph',
              content: parseInlineFormatting(listItem),
            },
          ],
        });
      } else {
        content.push({
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [
                {
                  type: 'paragraph',
                  content: parseInlineFormatting(listItem),
                },
              ],
            },
          ],
        });
      }
      continue;
    }

    // Handle numbered lists (lines starting with 1., 2., etc.)
    if (line.trim().match(/^\d+\.\s/)) {
      const listItem = line.trim().replace(/^\d+\.\s/, '');
      // Check if we need to create a new list or add to existing
      if (content.length > 0 && content[content.length - 1].type === 'orderedList') {
        content[content.length - 1].content.push({
          type: 'listItem',
          content: [
            {
              type: 'paragraph',
              content: parseInlineFormatting(listItem),
            },
          ],
        });
      } else {
        content.push({
          type: 'orderedList',
          content: [
            {
              type: 'listItem',
              content: [
                {
                  type: 'paragraph',
                  content: parseInlineFormatting(listItem),
                },
              ],
            },
          ],
        });
      }
      continue;
    }

    // Handle regular paragraphs with inline formatting
    content.push({
      type: 'paragraph',
      content: parseInlineFormatting(line),
    });
  }

  // Handle unclosed code block
  if (inCodeBlock && codeBlockLines.length > 0) {
    content.push({
      type: 'codeBlock',
      attrs: codeLanguage ? { language: codeLanguage } : {},
      content: [
        {
          type: 'text',
          text: codeBlockLines.join('\n'),
        },
      ],
    });
  }

  return {
    type: 'doc',
    version: 1,
    content: content.length > 0 ? content : [{ type: 'paragraph', content: [] }],
  };
}

export interface JiraIssue {
  key: string;
  fields: {
    summary: string;
    description?: string;
    status: {
      name: string;
    };
    issuetype: {
      name: string;
    };
    [key: string]: any;
  };
}

export interface JiraAttachment {
  id: string;
  filename: string;
  author: {
    displayName: string;
    emailAddress?: string;
  };
  created: string;
  size: number;
  mimeType: string;
  content: string; // URL to download the attachment
}

export interface AttachmentDownload {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  savedPath: string; // Path where the file was saved
}

export interface AttachmentUpload {
  id: string;
  filename: string;
  author: {
    displayName: string;
    emailAddress?: string;
  };
  created: string;
  size: number;
  mimeType: string;
  content: string; // URL to download the attachment
}

export class JiraClient {
  private client: AxiosInstance;

  constructor(
    private jiraUrl: string,
    private email: string,
    private apiToken: string
  ) {
    this.client = axios.create({
      baseURL: `${jiraUrl}/rest/api/3`,
      auth: {
        username: email,
        password: apiToken,
      },
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    });
  }

  async getIssue(issueKey: string, fields?: string[]): Promise<JiraIssue> {
    const params = fields && fields.length > 0 ? { fields: fields.join(',') } : {};
    const response = await this.client.get(`/issue/${issueKey}`, { params });
    return response.data;
  }

  /**
   * Get comprehensive issue details including ALL fields, comments, attachments, custom fields, etc.
   * Returns structured data ready for analysis
   */
  async getComprehensiveIssue(issueKey: string): Promise<any> {
    // Fetch the issue with all fields
    const response = await this.client.get(`/issue/${issueKey}`, {
      params: {
        expand: 'names,schema,renderedFields,changelog'
      }
    });

    const issue = response.data;
    
    // Extract and structure all the important information
    const comprehensiveData = {
      issueKey: issue.key,
      summary: issue.fields.summary,
      issueType: issue.fields.issuetype?.name,
      status: issue.fields.status?.name,
      priority: issue.fields.priority?.name,
      
      // Description
      description: this.extractDescription(issue.fields.description),
      
      // People
      reporter: {
        name: issue.fields.reporter?.displayName,
        email: issue.fields.reporter?.emailAddress,
      },
      assignee: {
        name: issue.fields.assignee?.displayName,
        email: issue.fields.assignee?.emailAddress,
      },
      
      // Dates
      created: issue.fields.created,
      updated: issue.fields.updated,
      dueDate: issue.fields.duedate,
      resolutionDate: issue.fields.resolutiondate,
      
      // Comments
      comments: this.extractComments(issue.fields.comment),
      
      // Attachments
      attachments: this.extractAttachments(issue.fields.attachment),
      
      // Custom fields (including RCA and other templates)
      customFields: this.extractCustomFields(issue.fields, issue.names),
      
      // All other fields
      allFields: issue.fields,
      
      // Field names mapping
      fieldNames: issue.names,
      
      // Change history
      changelog: issue.changelog,
    };

    return comprehensiveData;
  }

  /**
   * Extract description in readable format
   */
  private extractDescription(description: any): string {
    if (!description) return '';
    
    // If it's ADF format, convert to plain text
    if (description.type === 'doc' && description.content) {
      return this.adfToPlainText(description);
    }
    
    return String(description);
  }

  /**
   * Convert ADF to plain text for easier reading
   */
  private adfToPlainText(adf: any): string {
    if (!adf || !adf.content) return '';
    
    const lines: string[] = [];
    
    for (const node of adf.content) {
      if (node.type === 'paragraph' && node.content) {
        const text = node.content.map((c: any) => c.text || '').join('');
        lines.push(text);
      } else if (node.type === 'codeBlock' && node.content) {
        const code = node.content.map((c: any) => c.text || '').join('');
        lines.push('```\n' + code + '\n```');
      } else if (node.type === 'heading' && node.content) {
        const text = node.content.map((c: any) => c.text || '').join('');
        const level = '#'.repeat(node.attrs?.level || 1);
        lines.push(level + ' ' + text);
      } else if (node.type === 'bulletList' && node.content) {
        for (const item of node.content) {
          if (item.type === 'listItem' && item.content) {
            for (const para of item.content) {
              if (para.content) {
                const text = para.content.map((c: any) => c.text || '').join('');
                lines.push('- ' + text);
              }
            }
          }
        }
      }
    }
    
    return lines.join('\n');
  }

  /**
   * Extract and format comments
   */
  private extractComments(commentData: any): any[] {
    if (!commentData || !commentData.comments) return [];
    
    return commentData.comments.map((comment: any) => ({
      id: comment.id,
      author: comment.author?.displayName,
      created: comment.created,
      updated: comment.updated,
      body: this.extractDescription(comment.body),
    }));
  }

  /**
   * Extract attachment metadata
   */
  private extractAttachments(attachments: any[]): any[] {
    if (!attachments) return [];
    
    return attachments.map((att: any) => ({
      id: att.id,
      filename: att.filename,
      size: att.size,
      mimeType: att.mimeType,
      created: att.created,
      author: att.author?.displayName,
    }));
  }

  /**
   * Extract custom fields with their names
   */
  private extractCustomFields(fields: any, names: any): any {
    const customFields: any = {};
    
    // Iterate through all fields and identify custom fields
    for (const [fieldId, value] of Object.entries(fields)) {
      // Custom fields typically start with 'customfield_'
      if (fieldId.startsWith('customfield_')) {
        const fieldName = names?.[fieldId] || fieldId;
        customFields[fieldName] = this.formatCustomFieldValue(value);
      }
    }
    
    return customFields;
  }

  /**
   * Format custom field values for better readability
   */
  private formatCustomFieldValue(value: any): any {
    if (!value) return null;
    
    // Handle different custom field types
    if (typeof value === 'object') {
      // If it's ADF format (like description fields)
      if (value.type === 'doc') {
        return this.adfToPlainText(value);
      }
      
      // If it has a value property
      if (value.value) {
        return value.value;
      }
      
      // If it has a name property
      if (value.name) {
        return value.name;
      }
      
      // If it's an array
      if (Array.isArray(value)) {
        return value.map(v => this.formatCustomFieldValue(v));
      }
    }
    
    return value;
  }

  async searchIssues(jql: string, maxResults: number = 50): Promise<any> {
    let allIssues: any[] = [];
    let nextPageToken: string | undefined = undefined;
    let isLast = false;
    
    // Keep fetching until we get all results or hit maxResults
    while (!isLast && allIssues.length < maxResults) {
      const params: any = {
        jql,
        maxResults: Math.min(100, maxResults - allIssues.length), // Fetch up to 100 per page
        fields: 'summary,status,assignee,reporter,created,updated,issuetype',
      };
      
      if (nextPageToken) {
        params.nextPageToken = nextPageToken;
      }
      
      const response = await this.client.get('/search/jql', { params });
      const data = response.data;
      
      allIssues = allIssues.concat(data.issues || []);
      isLast = data.isLast !== false; // If isLast is missing or true, stop
      nextPageToken = data.nextPageToken;
      
      // Break if no more issues or no next page token
      if (!data.issues || data.issues.length === 0 || (!nextPageToken && !isLast)) {
        break;
      }
    }
    
    return {
      issues: allIssues,
      total: allIssues.length,
      isLast: true,
    };
  }

  async createIssue(params: {
    project: string;
    summary: string;
    description?: string;
    issueType: string;
  }): Promise<any> {
    const response = await this.client.post('/issue', {
      fields: {
        project: {
          key: params.project,
        },
        summary: params.summary,
        description: params.description ? textToADF(params.description) : undefined,
        issuetype: {
          name: params.issueType,
        },
      },
    });
    return response.data;
  }

  async updateIssue(
    issueKey: string,
    params: {
      summary?: string;
      description?: string;
    }
  ): Promise<any> {
    const fields: any = {};

    if (params.summary) {
      fields.summary = params.summary;
    }

    if (params.description) {
      fields.description = textToADF(params.description);
    }

    await this.client.put(`/issue/${issueKey}`, { fields });
    return { success: true, message: `Issue ${issueKey} updated successfully` };
  }

  async addComment(issueKey: string, comment: string, attachments?: string[]): Promise<any> {
    // First, add the comment
    const response = await this.client.post(`/issue/${issueKey}/comment`, {
      body: textToADF(comment),
    });

    // If attachments are provided, upload them
    if (attachments && attachments.length > 0) {
      const uploadedAttachments: AttachmentUpload[] = [];

      for (const filePath of attachments) {
        try {
          const uploaded = await this.uploadAttachment(issueKey, filePath);
          uploadedAttachments.push(...uploaded);
        } catch (error) {
          console.error(`Failed to upload attachment ${filePath}:`, error);
          // Continue with other attachments even if one fails
        }
      }

      return {
        comment: response.data,
        attachments: uploadedAttachments,
      };
    }

    return response.data;
  }

  async deleteComment(issueKey: string, commentId: string): Promise<any> {
    await this.client.delete(`/issue/${issueKey}/comment/${commentId}`);
    return { success: true, message: `Comment ${commentId} deleted successfully from issue ${issueKey}` };
  }

  async getAttachments(issueKey: string): Promise<JiraAttachment[]> {
    const issue = await this.getIssue(issueKey, ['attachment']);
    const attachments = issue.fields.attachment || [];

    return attachments.map((attachment: any) => ({
      id: attachment.id,
      filename: attachment.filename,
      author: {
        displayName: attachment.author.displayName,
        emailAddress: attachment.author.emailAddress,
      },
      created: attachment.created,
      size: attachment.size,
      mimeType: attachment.mimeType,
      content: attachment.content,
    }));
  }

  async downloadAttachment(attachmentId: string, outputDir?: string): Promise<AttachmentDownload> {
    // First, get attachment metadata
    const metadataResponse = await this.client.get(`/attachment/${attachmentId}`);
    const metadata = metadataResponse.data;

    // Download the attachment content
    const contentResponse = await this.client.get(metadata.content, {
      responseType: 'arraybuffer',
      // Use the full URL from metadata.content which is absolute
      baseURL: undefined,
    });

    // Determine output directory
    const saveDir = outputDir || process.cwd();

    // Ensure directory exists
    if (!fs.existsSync(saveDir)) {
      fs.mkdirSync(saveDir, { recursive: true });
    }

    // Generate safe filename
    const filename = metadata.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const fullPath = path.join(saveDir, filename);

    // Save file to disk
    fs.writeFileSync(fullPath, Buffer.from(contentResponse.data));

    return {
      id: metadata.id,
      filename: metadata.filename,
      mimeType: metadata.mimeType,
      size: metadata.size,
      savedPath: fullPath,
    };
  }

  async uploadAttachment(issueKey: string, filePath: string): Promise<AttachmentUpload[]> {
    // Verify file exists
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    // Create form data
    const form = new FormData();
    form.append('file', fs.createReadStream(filePath), {
      filename: path.basename(filePath),
    });

    // Upload attachment using multipart/form-data
    const response = await this.client.post(`/issue/${issueKey}/attachments`, form, {
      headers: {
        ...form.getHeaders(),
        'X-Atlassian-Token': 'no-check', // Required header for Jira API
      },
    });

    // Map response to AttachmentUpload format
    return response.data.map((attachment: any) => ({
      id: attachment.id,
      filename: attachment.filename,
      author: {
        displayName: attachment.author.displayName,
        emailAddress: attachment.author.emailAddress,
      },
      created: attachment.created,
      size: attachment.size,
      mimeType: attachment.mimeType,
      content: attachment.content,
    }));
  }
}
