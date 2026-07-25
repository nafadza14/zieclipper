import json
import os
import anthropic


def call_tool(
    provider: str,
    model: str,
    system: str,
    user_msg: str,
    tool_def: dict,
    tool_name: str,
    max_tokens: int = 4096,
) -> dict:
    """Call LLM with forced tool use. Returns the parsed tool input dict.

    tool_def must be in Anthropic format: {name, description, input_schema}.
    """
    if provider == 'anthropic':
        client = anthropic.Anthropic()
        resp = client.messages.create(
            model=model,
            max_tokens=max_tokens,
            system=system,
            messages=[{"role": "user", "content": user_msg}],
            tools=[tool_def],
            tool_choice={"type": "tool", "name": tool_name},
        )
        for block in resp.content:
            if block.type == "tool_use" and block.name == tool_name:
                return block.input
        raise RuntimeError("No tool_use block in Anthropic response")

    # DeepSeek and Gemini both expose an OpenAI-compatible endpoint
    from openai import OpenAI

    if provider == 'deepseek':
        client = OpenAI(
            api_key=os.environ['DEEPSEEK_API_KEY'],
            base_url='https://api.deepseek.com',
        )
    else:  # gemini
        client = OpenAI(
            api_key=os.environ['GEMINI_API_KEY'],
            base_url='https://generativelanguage.googleapis.com/v1beta/openai/',
        )

    oai_tool = {
        "type": "function",
        "function": {
            "name": tool_def["name"],
            "description": tool_def["description"],
            "parameters": tool_def["input_schema"],
        },
    }
    resp = client.chat.completions.create(
        model=model,
        max_tokens=max_tokens,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user_msg},
        ],
        tools=[oai_tool],
        tool_choice={"type": "function", "function": {"name": tool_name}},
    )
    args_str = resp.choices[0].message.tool_calls[0].function.arguments
    return json.loads(args_str)
