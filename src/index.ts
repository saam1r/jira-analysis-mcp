#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { JiraClient } from './jira-client.js';
import dotenv from 'dotenv';

dotenv.config();

const JIRA_URL = process.env.JIRA_URL;
const JIRA_EMAIL = process.env.JIRA_EMAIL;
const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN;

if (!JIRA_URL || !JIRA_EMAIL || !JIRA_API_TOKEN) {
  console.error('Error: Missing required environment variables');
  console.error('Please set JIRA_URL, JIRA_EMAIL, and JIRA_API_TOKEN');
  process.exit(1);
}

const jiraClient = new JiraClient(JIRA_URL, JIRA_EMAIL, JIRA_API_TOKEN);

/**
 * Pod alias mappings for easier searching
 * Maps shorthand names to full pod names in Jira
 */
const POD_ALIASES: { [key: string]: string } = {
  'workflow': 'Pod 1 Workflow',
  'pod1': 'Pod 1 Workflow',
  'pod 1': 'Pod 1 Workflow',
  'growth': 'Pod 2 Growth',
  'pod2': 'Pod 2 Growth',
  'pod 2': 'Pod 2 Growth',
  'platform': 'Platform Pod',
  'siteops': 'Pod SiteOps',
  'site ops': 'Pod SiteOps',
  'ai': 'AI Pod',
  'ds': 'DS Pod',
  'design': 'DS Pod',
  'scale': 'Scale Pod',
};

/**
 * Expand pod aliases in JQL query
 * Converts shorthand pod names to full Jira pod names
 */
function expandPodAliases(jql: string): string {
  let expandedJql = jql;
  
  // Match patterns like: pod = "workflow" or Pod = "growth" (case insensitive)
  const podPattern = /Pod\s*=\s*["']([^"']+)["']/gi;
  
  expandedJql = expandedJql.replace(podPattern, (match, podName) => {
    const normalizedPod = podName.toLowerCase().trim();
    const fullPodName = POD_ALIASES[normalizedPod];
    
    if (fullPodName) {
      return `Pod = "${fullPodName}"`;
    }
    return match; // Return original if no alias found
  });
  
  return expandedJql;
}

/**
 * Generate structured ticket analysis
 * Filters out AI-assisted comments and focuses on key information
 */
function generateTicketAnalysis(ticketData: any): any {
  try {
    // Ensure comments is an array
    const allComments = Array.isArray(ticketData.comments) ? ticketData.comments : [];
    
    // Filter out AI-assisted comments (AI-generated investigation comments)
    const humanComments = allComments.filter((c: any) => {
      if (!c) return false;
      const isAIComment = 
        (c.author && String(c.author).toLowerCase().includes('yash jhunjhunwala')) ||
        (c.body && (
          String(c.body).includes('🤖 AI-Assisted Investigation') ||
          String(c.body).includes('Claude Code') ||
          String(c.body).includes('This investigation was conducted by')
        ));
      return !isAIComment;
    });

    // Extract key custom fields
    const customFields = ticketData.customFields || {};
    const probableCause = customFields['Probable Cause'] || 'Not documented';
    const rootCause = customFields['Root Cause'] || 'Not documented';
    const resolutionType = customFields['Resolution Type'] || 'Not documented';
    const isRegression = customFields['Regression?'] || 'Not documented';
    const pod = customFields['Pod'] || [];
    const orgName = customFields['Org Name'] || 'Not specified';
    const customerTier = customFields['Customer Tier'] || 'Not specified';
    const platform = customFields['Platform'] || 'Not specified';
    const sections = customFields['Sections from Sprinto App'] || 'Not specified';

    return {
      ticketInfo: {
        issueKey: ticketData.issueKey,
        summary: ticketData.summary,
        issueType: ticketData.issueType,
        priority: ticketData.priority,
        status: ticketData.status,
        pod: Array.isArray(pod) ? pod : [pod],
        created: ticketData.created,
        resolved: ticketData.resolutionDate,
        dueDate: ticketData.dueDate,
      },
      
      customerContext: {
        organization: orgName,
        tier: customerTier,
        platform: platform,
        affectedSection: sections,
      },

      whatCustomerSaw: {
        description: ticketData.description || 'No description provided',
        reportedBy: ticketData.reporter?.name || 'Unknown',
        attachments: (ticketData.attachments || []).map((a: any) => ({
          filename: a.filename,
          uploadedBy: a.author,
          date: a.created,
        })),
      },

      howItHappened: {
        probableCause: probableCause,
        rootCause: rootCause,
        isRegression: isRegression,
      },

    howItWasFixed: {
      resolutionType: resolutionType,
      assignedTo: ticketData.assignee?.name || 'Unassigned',
      currentStatus: ticketData.status,
    },

      timeline: {
        created: ticketData.created,
        updated: ticketData.updated,
        resolved: ticketData.resolutionDate,
        timeToResolution: ticketData.resolutionDate 
          ? Math.floor((new Date(ticketData.resolutionDate).getTime() - new Date(ticketData.created).getTime()) / (1000 * 60 * 60 * 24)) + ' days'
          : 'Not resolved yet',
      },

      additionalInfo: {
        totalAttachments: (ticketData.attachments || []).length,
        developmentStartDate: customFields['Development Start Date'] || null,
        releaseDate: customFields['Release date'] || null,
      },
    };
  } catch (error) {
    return {
      error: 'Failed to generate analysis',
      message: error instanceof Error ? error.message : String(error),
      ticketKey: ticketData?.issueKey || 'Unknown',
    };
  }
}

const server = new Server(
  {
    name: 'jira-mcp-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

const tools: Tool[] = [
  {
    name: 'get_issue',
    description: 'Get details of a Jira issue by key (e.g., PROJ-123). Use the fields parameter to limit response size.',
    inputSchema: {
      type: 'object',
      properties: {
        issueKey: {
          type: 'string',
          description: 'The Jira issue key (e.g., PROJ-123)',
        },
        fields: {
          type: 'array',
          items: {
            type: 'string',
          },
          description: 'Optional array of field names to retrieve (e.g., ["summary", "status", "description"]). If not provided, returns all fields.',
        },
      },
      required: ['issueKey'],
    },
  },
  {
    name: 'search_issues',
    description: 'Search for Jira issues using JQL (Jira Query Language). Supports pod aliases: use "workflow" for Pod 1 Workflow, "growth" for Pod 2 Growth, "platform" for Platform Pod, "siteops" for Pod SiteOps, "ai" for AI Pod, "ds" for DS Pod, "scale" for Scale Pod.',
    inputSchema: {
      type: 'object',
      properties: {
        jql: {
          type: 'string',
          description: 'JQL query string (e.g., "project = PROJ AND status = Open" or "Pod = \'workflow\' AND created >= 2025-12-01"). Pod aliases supported: workflow, growth, platform, siteops, ai, ds, scale.',
        },
        maxResults: {
          type: 'number',
          description: 'Maximum number of results to return (default: 50)',
        },
      },
      required: ['jql'],
    },
  },
  {
    name: 'create_issue',
    description: 'Create a new Jira issue',
    inputSchema: {
      type: 'object',
      properties: {
        project: {
          type: 'string',
          description: 'Project key (e.g., PROJ)',
        },
        summary: {
          type: 'string',
          description: 'Issue summary/title',
        },
        description: {
          type: 'string',
          description: 'Issue description',
        },
        issueType: {
          type: 'string',
          description: 'Issue type (e.g., Task, Bug, Story)',
        },
      },
      required: ['project', 'summary', 'issueType'],
    },
  },
  {
    name: 'update_issue',
    description: 'Update an existing Jira issue',
    inputSchema: {
      type: 'object',
      properties: {
        issueKey: {
          type: 'string',
          description: 'The Jira issue key (e.g., PROJ-123)',
        },
        summary: {
          type: 'string',
          description: 'New issue summary/title',
        },
        description: {
          type: 'string',
          description: 'New issue description',
        },
      },
      required: ['issueKey'],
    },
  },
  {
    name: 'add_comment',
    description: 'Add a comment to a Jira issue with optional file attachments',
    inputSchema: {
      type: 'object',
      properties: {
        issueKey: {
          type: 'string',
          description: 'The Jira issue key (e.g., PROJ-123)',
        },
        comment: {
          type: 'string',
          description: 'Comment text',
        },
        attachments: {
          type: 'array',
          items: {
            type: 'string',
          },
          description: 'Optional array of absolute file paths to attach to the comment',
        },
      },
      required: ['issueKey', 'comment'],
    },
  },
  {
    name: 'delete_comment',
    description: 'Delete a comment from a Jira issue',
    inputSchema: {
      type: 'object',
      properties: {
        issueKey: {
          type: 'string',
          description: 'The Jira issue key (e.g., PROJ-123)',
        },
        commentId: {
          type: 'string',
          description: 'The comment ID to delete',
        },
      },
      required: ['issueKey', 'commentId'],
    },
  },
  {
    name: 'get_attachments',
    description: 'Get all attachments for a Jira issue, including metadata and download URLs',
    inputSchema: {
      type: 'object',
      properties: {
        issueKey: {
          type: 'string',
          description: 'The Jira issue key (e.g., PROJ-123)',
        },
      },
      required: ['issueKey'],
    },
  },
  {
    name: 'download_attachment',
    description: 'Download a specific attachment from a Jira issue and save it to disk',
    inputSchema: {
      type: 'object',
      properties: {
        attachmentId: {
          type: 'string',
          description: 'The attachment ID',
        },
        outputDir: {
          type: 'string',
          description: 'Directory to save the file (optional, defaults to current directory)',
        },
      },
      required: ['attachmentId'],
    },
  },
  {
    name: 'add_attachment',
    description: 'Upload and attach a file to a Jira issue',
    inputSchema: {
      type: 'object',
      properties: {
        issueKey: {
          type: 'string',
          description: 'The Jira issue key (e.g., PROJ-123)',
        },
        filePath: {
          type: 'string',
          description: 'Absolute path to the file to attach',
        },
      },
      required: ['issueKey', 'filePath'],
    },
  },
  {
    name: 'get_comprehensive_issue',
    description: 'Get ALL details of a Jira issue including description, comments, custom fields (RCA templates, etc.), attachments, changelog, and complete field data. This tool fetches everything about a ticket in one call.',
    inputSchema: {
      type: 'object',
      properties: {
        issueKey: {
          type: 'string',
          description: 'The Jira issue key (e.g., PROJ-123)',
        },
      },
      required: ['issueKey'],
    },
  },
  {
    name: 'analyze_ticket',
    description: 'Analyze a Jira ticket comprehensively and provide structured insights including summary, key findings, comments analysis, RCA details, timeline, and recommendations. This is perfect for getting a complete understanding of any ticket.',
    inputSchema: {
      type: 'object',
      properties: {
        issueKey: {
          type: 'string',
          description: 'The Jira issue key (e.g., PROJ-123)',
        },
      },
      required: ['issueKey'],
    },
  },
];

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (!args) {
    return {
      content: [
        {
          type: 'text',
          text: 'Error: Missing arguments',
        },
      ],
      isError: true,
    };
  }

  try {
    switch (name) {
      case 'get_issue': {
        const result = await jiraClient.getIssue(
          args.issueKey as string,
          args.fields as string[] | undefined
        );
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'search_issues': {
        // Expand pod aliases in the JQL query
        const expandedJql = expandPodAliases(args.jql as string);
        
        const result = await jiraClient.searchIssues(
          expandedJql,
          args.maxResults as number | undefined
        );
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'create_issue': {
        const result = await jiraClient.createIssue({
          project: args.project as string,
          summary: args.summary as string,
          description: args.description as string,
          issueType: args.issueType as string,
        });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'update_issue': {
        const result = await jiraClient.updateIssue(
          args.issueKey as string,
          {
            summary: args.summary as string | undefined,
            description: args.description as string | undefined,
          }
        );
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'add_comment': {
        const result = await jiraClient.addComment(
          args.issueKey as string,
          args.comment as string,
          args.attachments as string[] | undefined
        );
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'delete_comment': {
        const result = await jiraClient.deleteComment(
          args.issueKey as string,
          args.commentId as string
        );
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'get_attachments': {
        const result = await jiraClient.getAttachments(args.issueKey as string);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'download_attachment': {
        const result = await jiraClient.downloadAttachment(
          args.attachmentId as string,
          args.outputDir as string | undefined
        );
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'add_attachment': {
        const result = await jiraClient.uploadAttachment(
          args.issueKey as string,
          args.filePath as string
        );
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'get_comprehensive_issue': {
        const result = await jiraClient.getComprehensiveIssue(args.issueKey as string);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'analyze_ticket': {
        const ticketData = await jiraClient.getComprehensiveIssue(args.issueKey as string);
        
        // Generate structured ticket analysis
        const analysis = generateTicketAnalysis(ticketData);
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(analysis, null, 2),
            },
          ],
        };
      }

      default:
        return {
          content: [
            {
              type: 'text',
              text: `Unknown tool: ${name}`,
            },
          ],
          isError: true,
        };
    }
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Jira MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
