import { NodeComponent } from "../../../types"

const GMAIL_CREATE_LABEL_METADATA = {
  key: "gmail_action_create_label",
  name: "Create Label",
  description: "Create a new Gmail label (folder)"
}

export const createLabelActionSchema: NodeComponent = {
  type: GMAIL_CREATE_LABEL_METADATA.key,
  title: "Create Label",
  description: GMAIL_CREATE_LABEL_METADATA.description,
  icon: "TagPlus" as any, // Will be resolved in index file
  isTrigger: false,
  providerId: "gmail",
  testable: true,
  requiredScopes: ["https://www.googleapis.com/auth/gmail.labels"],
  category: "Communication",
  outputSchema: [
    {
      name: "labelId",
      label: "Label ID",
      type: "string",
      description: "Unique identifier for the created label",
      example: "Label_123"
    },
    {
      name: "labelName",
      label: "Label Name",
      type: "string",
      description: "Name of the created label",
      example: "Important/Work"
    },
    {
      name: "color",
      label: "Label Color",
      type: "object",
      description: "Color assigned to the label",
      example: { backgroundColor: "#42d692", textColor: "#ffffff" }
    }
  ],
  configSchema: [
    {
      name: "labelName",
      label: "Label Name",
      type: "text",
      required: true,
      placeholder: "Work/Projects",
      description: "Name for the new label. Use '/' to create nested labels (e.g., 'Work/Projects')",
      tooltip: "Gmail supports nested labels using forward slashes. For example, 'Work/Important' creates a label 'Important' inside a parent label 'Work'."
    },
    {
      name: "labelListVisibility",
      label: "Show in Label List",
      type: "select",
      required: false,
      defaultValue: "labelShow",
      options: [
        { value: "labelShow", label: "Show in label list" },
        { value: "labelShowIfUnread", label: "Show only if there are unread messages" },
        { value: "labelHide", label: "Hide from label list" }
      ],
      description: "Control when this label appears in Gmail's label list"
    },
    {
      name: "messageListVisibility",
      label: "Show in Message List",
      type: "select",
      required: false,
      defaultValue: "show",
      options: [
        { value: "show", label: "Show in message list" },
        { value: "hide", label: "Hide from message list (acts like archive)" }
      ],
      description: "Control whether messages with this label appear in the message list"
    },
    {
      name: "backgroundColor",
      label: "Background Color (Optional)",
      type: "select",
      required: false,
      showColorPreview: true,
      options: [
        // Grayscale
        { value: "#000000", label: "Black", color: "#000000" },
        { value: "#434343", label: "Dark Gray", color: "#434343" },
        { value: "#666666", label: "Medium Gray", color: "#666666" },
        { value: "#999999", label: "Light Gray", color: "#999999" },
        { value: "#cccccc", label: "Very Light Gray", color: "#cccccc" },
        { value: "#efefef", label: "Off White", color: "#efefef" },
        { value: "#f3f3f3", label: "White", color: "#f3f3f3" },

        // Reds
        { value: "#fb4c2f", label: "Red", color: "#fb4c2f" },
        { value: "#e66550", label: "Light Red", color: "#e66550" },
        { value: "#cc3a21", label: "Dark Red", color: "#cc3a21" },
        { value: "#ac2b16", label: "Deep Red", color: "#ac2b16" },

        // Oranges
        { value: "#ffad46", label: "Orange", color: "#ffad46" },
        { value: "#ff7537", label: "Bright Orange", color: "#ff7537" },
        { value: "#eaa041", label: "Dark Orange", color: "#eaa041" },
        { value: "#cf8933", label: "Deep Orange", color: "#cf8933" },

        // Yellows
        { value: "#fad165", label: "Yellow", color: "#fad165" },
        { value: "#f2c960", label: "Golden Yellow", color: "#f2c960" },
        { value: "#fcda83", label: "Light Yellow", color: "#fcda83" },
        { value: "#fce8b3", label: "Pale Yellow", color: "#fce8b3" },

        // Greens
        { value: "#16a765", label: "Green", color: "#16a765" },
        { value: "#42d692", label: "Teal", color: "#42d692" },
        { value: "#149e60", label: "Dark Green", color: "#149e60" },
        { value: "#0b804b", label: "Deep Green", color: "#0b804b" },
        { value: "#44b984", label: "Sea Green", color: "#44b984" },
        { value: "#89d3b2", label: "Mint Green", color: "#89d3b2" },

        // Blues
        { value: "#4986e7", label: "Blue", color: "#4986e7" },
        { value: "#6d9eeb", label: "Sky Blue", color: "#6d9eeb" },
        { value: "#3c78d8", label: "Dark Blue", color: "#3c78d8" },
        { value: "#285bac", label: "Deep Blue", color: "#285bac" },
        { value: "#a4c2f4", label: "Light Blue", color: "#a4c2f4" },
        { value: "#c9daf8", label: "Pale Blue", color: "#c9daf8" },

        // Purples
        { value: "#b99aff", label: "Purple", color: "#b99aff" },
        { value: "#8e63ce", label: "Dark Purple", color: "#8e63ce" },
        { value: "#653e9b", label: "Deep Purple", color: "#653e9b" },
        { value: "#b694e8", label: "Lavender", color: "#b694e8" },
        { value: "#d0bcf1", label: "Light Purple", color: "#d0bcf1" },

        // Pinks
        { value: "#f691b2", label: "Pink", color: "#f691b2" },
        { value: "#f7a7c0", label: "Light Pink", color: "#f7a7c0" },
        { value: "#e07798", label: "Rose Pink", color: "#e07798" },
        { value: "#fbc8d9", label: "Pale Pink", color: "#fbc8d9" }
      ],
      description: "Background color for the label"
    },
    {
      name: "textColor",
      label: "Text Color (Optional)",
      type: "select",
      required: false,
      showColorPreview: true,
      options: [
        // Grayscale
        { value: "#000000", label: "Black", color: "#000000" },
        { value: "#434343", label: "Dark Gray", color: "#434343" },
        { value: "#666666", label: "Medium Gray", color: "#666666" },
        { value: "#999999", label: "Light Gray", color: "#999999" },
        { value: "#cccccc", label: "Very Light Gray", color: "#cccccc" },
        { value: "#efefef", label: "Off White", color: "#efefef" },
        { value: "#f3f3f3", label: "White", color: "#f3f3f3" },
        { value: "#ffffff", label: "Pure White", color: "#ffffff" },

        // Reds
        { value: "#fb4c2f", label: "Red", color: "#fb4c2f" },
        { value: "#e66550", label: "Light Red", color: "#e66550" },
        { value: "#cc3a21", label: "Dark Red", color: "#cc3a21" },
        { value: "#ac2b16", label: "Deep Red", color: "#ac2b16" },
        { value: "#822111", label: "Maroon", color: "#822111" },

        // Oranges
        { value: "#ffad46", label: "Orange", color: "#ffad46" },
        { value: "#ff7537", label: "Bright Orange", color: "#ff7537" },
        { value: "#eaa041", label: "Dark Orange", color: "#eaa041" },
        { value: "#cf8933", label: "Deep Orange", color: "#cf8933" },
        { value: "#a46a21", label: "Brown Orange", color: "#a46a21" },

        // Yellows
        { value: "#fad165", label: "Yellow", color: "#fad165" },
        { value: "#f2c960", label: "Golden Yellow", color: "#f2c960" },
        { value: "#fcda83", label: "Light Yellow", color: "#fcda83" },
        { value: "#fce8b3", label: "Pale Yellow", color: "#fce8b3" },
        { value: "#d5ae49", label: "Dark Yellow", color: "#d5ae49" },

        // Greens
        { value: "#16a765", label: "Green", color: "#16a765" },
        { value: "#42d692", label: "Teal", color: "#42d692" },
        { value: "#149e60", label: "Dark Green", color: "#149e60" },
        { value: "#0b804b", label: "Deep Green", color: "#0b804b" },
        { value: "#44b984", label: "Sea Green", color: "#44b984" },
        { value: "#89d3b2", label: "Mint Green", color: "#89d3b2" },
        { value: "#2a9c68", label: "Forest Green", color: "#2a9c68" },
        { value: "#076239", label: "Dark Forest Green", color: "#076239" },

        // Blues
        { value: "#4986e7", label: "Blue", color: "#4986e7" },
        { value: "#6d9eeb", label: "Sky Blue", color: "#6d9eeb" },
        { value: "#3c78d8", label: "Dark Blue", color: "#3c78d8" },
        { value: "#285bac", label: "Deep Blue", color: "#285bac" },
        { value: "#a4c2f4", label: "Light Blue", color: "#a4c2f4" },
        { value: "#c9daf8", label: "Pale Blue", color: "#c9daf8" },
        { value: "#1c4587", label: "Navy Blue", color: "#1c4587" },

        // Purples
        { value: "#b99aff", label: "Purple", color: "#b99aff" },
        { value: "#8e63ce", label: "Dark Purple", color: "#8e63ce" },
        { value: "#653e9b", label: "Deep Purple", color: "#653e9b" },
        { value: "#b694e8", label: "Lavender", color: "#b694e8" },
        { value: "#d0bcf1", label: "Light Purple", color: "#d0bcf1" },
        { value: "#41236d", label: "Royal Purple", color: "#41236d" },

        // Pinks
        { value: "#f691b2", label: "Pink", color: "#f691b2" },
        { value: "#f7a7c0", label: "Light Pink", color: "#f7a7c0" },
        { value: "#e07798", label: "Rose Pink", color: "#e07798" },
        { value: "#fbc8d9", label: "Pale Pink", color: "#fbc8d9" },
        { value: "#b65775", label: "Mauve Pink", color: "#b65775" }
      ],
      description: "Text color for the label"
    },
  ],
}
