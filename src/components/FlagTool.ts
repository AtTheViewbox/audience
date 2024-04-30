import { ProbeTool } from '@cornerstonejs/tools';

class FlagTool extends ProbeTool {
  constructor(
    toolProps: PublicToolProps = {},
    defaultToolProps: ToolProps = {
      supportedInteractionTypes: ['Mouse', 'Touch'],
      configuration: {
        shadow: true,
        preventHandleOutsideImage: true,
        getTextLines: (data, targetId) => ([]),
      },
    }
  ) {
    super(toolProps, defaultToolProps);
  }
}

FlagTool.toolName = 'Flag';
export default FlagTool;

