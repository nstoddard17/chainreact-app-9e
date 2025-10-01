# AI Agent Testing Setup Guide
**Testing the Smart Email Triage Template**

## Step 1: Copy the Template

1. Go to the **Templates** tab in Workflows
2. Find **"Smart Email Triage - Sales & Support Router"**
3. Click the **Play button** (▶️) to copy it to your workflows
4. You'll be redirected to the workflow builder

---

## Step 2: Understand the Workflow Structure

The workflow uses **AI Agent Chains** for automatic routing:

```
📧 Gmail Trigger (New Email)
    ↓
🤖 AI Agent (Email Classification)
    ├── Chain 0 (SALES): Log to Airtable → Notify Slack
    ├── Chain 1 (SUPPORT): Create Airtable Ticket → Alert Slack
    └── Chain 2 (INTERNAL): Add to Notion
```

**How AI Agent Chains Work:**
- The AI Agent analyzes the email and outputs: "sales", "support", or "internal"
- Based on the classification, the appropriate chain automatically executes
- No manual conditional routing needed - chains are built into the AI Agent

---

## Step 3: Configure Gmail Trigger

1. **Double-click the Gmail trigger node** or click the settings icon
2. **Select labels to monitor**:
   - Recommended: INBOX (monitors all new emails)
   - Or create a specific label like "ChainReact Test"
3. **Save the configuration**

**Verification:**
- The trigger node should NOT show "⚠️ Incomplete" badge
- Should show your Gmail account as connected

---

## Step 4: Configure the AI Agent Node

1. **Double-click the AI Agent node**
2. **Review the prompt** - it should be something like:
   ```
   Analyze the following email and classify it as:
   - "sales" if it's a sales inquiry, demo request, or pricing question
   - "support" if it's a technical issue, bug report, or help request
   - "internal" if it's team communication or internal discussion

   Email Subject: {{trigger.subject}}
   Email Body: {{trigger.body}}

   Respond with ONLY one word: sales, support, or internal
   ```

3. **Check the model** (GPT-4o-mini is fine for this)
4. **Save the configuration**

**Verification:**
- AI Agent node should reference email data from trigger
- Output should be stored as a variable (usually `{{aiAgent.result}}`)

---

## Step 5: Verify AI Agent Chains

The AI Agent should already have 3 chains configured:

1. **Double-click the AI Agent node** to open the chain builder
2. **Verify 3 chains exist**:
   - **Chain 0 (Sales)**: Triggered when AI outputs "sales"
   - **Chain 1 (Support)**: Triggered when AI outputs "support"
   - **Chain 2 (Internal)**: Triggered when AI outputs "internal"

3. **Each chain should have 1-2 action nodes**:
   - Log/Create record in Airtable
   - Send notification to Slack

**Note**: The chains are automatically triggered based on the AI's classification. You don't need to set up conditional logic manually.

---

## Step 6: Configure Action Nodes

### For Slack Notifications:

The template includes 2 Slack notification nodes:
- **"Notify Sales Team"** (in Chain 0)
- **"Alert Support Team"** (in Chain 1)

**To configure each:**
1. **Double-click the Slack node**
2. **Connect your Slack workspace** (if not already connected)
3. **Select a channel** (e.g., `#sales-leads`, `#support-tickets`, or create `#ai-agent-test`)
4. **Customize the message** (suggested format):
   ```
   🔔 New {{aiAgent.result}} email received!

   From: {{trigger.from}}
   Subject: {{trigger.subject}}

   Email preview: {{trigger.bodyPreview}}
   ```

### For Airtable Logging:

The template includes 2 Airtable nodes:
- **"Log Sales Lead"** (in Chain 0)
- **"Create Support Ticket"** (in Chain 1)

**To configure each:**
1. **Double-click the Airtable node**
2. **Connect your Airtable account** (if not already connected)
3. **Select your base and table**:
   - Create a table like "Sales Leads" or "Support Tickets"
   - Suggested columns: Email From, Subject, Body, Classification, Timestamp
4. **Map the fields**:
   - Email From → `{{trigger.from}}`
   - Subject → `{{trigger.subject}}`
   - Body/Description → `{{trigger.body}}`
   - Classification → `{{aiAgent.result}}`
   - Timestamp → `{{trigger.timestamp}}`

### For Notion (Internal Chain):

The template includes 1 Notion node:
- **"Add to Team Docs"** (in Chain 2)

**To configure:**
1. **Double-click the Notion node**
2. **Connect your Notion workspace**
3. **Select a database** (e.g., "Team Communications" or "Internal Emails")
4. **Map fields** similar to Airtable above

---

## Step 7: Save and Activate

1. **Click "Save Workflow"** in the top right
2. **Click "Activate Workflow"** (or the Play button)
3. **Verify it's active** - status should change to "Active" with green dot

---

## Step 8: Run the Test

### Option A: Email Yourself (Recommended)
1. Open `/learning/test-emails/ai-agent-test-emails.md`
2. Send yourself Test Email #1 (Subtle Sales Inquiry)
3. Wait 30-60 seconds for the workflow to trigger
4. Check your Discord/Slack channel for the notification
5. Check Airtable to see if it logged correctly
6. Verify the classification was "sales"

### Option B: Use Gmail Label Filter
If you created a specific label:
1. Send the test email
2. Apply the label to the email in Gmail
3. The workflow should trigger

### Testing Tips:
- **Start with one email** to verify everything works
- **Check the workflow execution history** (if available)
- **Monitor the console** for any errors
- **Test emails 1-10** from the test email document for full validation

---

## Step 9: Verify Results

After sending a test email, check:

✅ **Gmail Trigger Fired:**
- Check workflow execution history
- Should see a new execution entry

✅ **AI Agent Classified:**
- Discord/Slack message should show the classification
- Message should say "sales", "support", or "internal"

✅ **Actions Executed:**
- Airtable should have a new row with email data
- Discord/Slack should have the notification

✅ **Correct Classification:**
- Compare AI's classification to expected result in test email doc

---

## Step 10: Full Test Suite

Once the first email works:

1. **Send all 10 test emails** from `/learning/test-emails/ai-agent-test-emails.md`
2. **Use different sender addresses** to avoid confusion:
   - yourname+sales1@gmail.com
   - yourname+support1@gmail.com
   - yourname+internal1@gmail.com
   - (Gmail ignores anything after +)

3. **Track results in a spreadsheet:**
   | Email # | Subject | Expected | AI Result | Correct? |
   |---------|---------|----------|-----------|----------|
   | 1 | Quick question... | Sales | ? | ? |
   | 2 | Having trouble... | Support | ? | ? |
   | ... | ... | ... | ... | ... |

4. **Calculate accuracy:**
   - 8+ correct = Excellent (80%+)
   - 5-7 correct = Good (50-70%)
   - <5 correct = Needs tuning

---

## Troubleshooting

### Workflow Not Triggering:
- ✅ Verify Gmail integration is connected
- ✅ Check that workflow status is "Active"
- ✅ Try sending email to a different label
- ✅ Check Gmail API permissions

### AI Agent Not Working:
- ✅ Verify AI agent has access to trigger variables
- ✅ Check that model (GPT-4o-mini) is configured
- ✅ Review prompt to ensure it references correct variables
- ✅ Check API key is set up

### Wrong Classifications:
- ✅ Review AI agent prompt - may need refinement
- ✅ Check if variables are resolving correctly
- ✅ Try more explicit test emails first
- ✅ Consider adding examples to the AI prompt

### Actions Not Executing:
- ✅ Verify conditional routing logic
- ✅ Check that action nodes are properly configured
- ✅ Ensure integrations (Discord/Airtable) are connected
- ✅ Review workflow execution logs for errors

---

## Success Metrics

After completing the full test:

**Excellent Performance (80%+):**
- AI correctly classifies subtle context
- Routes emails to appropriate channels
- Logs data accurately
- Ready for production use

**Good Performance (50-70%):**
- AI gets most classifications right
- May struggle with very subtle emails
- Consider refining prompts or adding examples

**Needs Improvement (<50%):**
- Review AI agent configuration
- Check variable references
- Verify integrations are working
- Consider using GPT-4o instead of mini for better accuracy

---

## Next Steps

Once testing is complete:

1. **Document findings** - note which emails were misclassified
2. **Refine the AI prompt** if needed to improve accuracy
3. **Add more sophisticated routing** based on your needs
4. **Scale the workflow** to handle real production emails
5. **Monitor performance** over time and adjust as needed

## Files Referenced

- Test emails: `/learning/test-emails/ai-agent-test-emails.md`
- This guide: `/learning/docs/ai-agent-testing-setup-guide.md`
