import os
import time
from dotenv import load_dotenv
import openai
import google.genai as genai
from google.genai.errors import APIError, ServerError, ClientError

load_dotenv()

# Read API keys from .env
gemini_key = os.getenv("GEMINI_API_KEY")
openai_key = os.getenv("OPENAI_API_KEY")


def generate_text(prompt, system_instruction="", provider=None):
    """
    Generate text using Gemini (primary) or OpenAI (secondary).
    Raises RuntimeError if no API key is configured.
    """
    # Pick provider based on available keys, unless caller overrides
    selected_provider = provider
    if not selected_provider:
        if gemini_key:
            selected_provider = "gemini"
        elif openai_key:
            selected_provider = "openai"
        else:
            raise RuntimeError(
                "No LLM API key configured. "
                "Set GEMINI_API_KEY or OPENAI_API_KEY in backend/.env"
            )

    if selected_provider == "gemini":
        model_name = os.getenv("GEMINI_MODEL", "models/gemini-2.5-flash-lite")
        client_gemini = genai.Client(api_key=gemini_key)
        full_prompt = f"{system_instruction}\n\n{prompt}" if system_instruction else prompt

        # Build fallback model list to ensure maximum reliability and availability
        models_to_try = [model_name]
        if model_name.startswith("models/"):
            models_to_try.append(model_name[len("models/"):])
        else:
            models_to_try.append(f"models/{model_name}")

        fallbacks = ["gemini-2.5-flash-lite", "gemini-2.5-flash", "gemini-2.0-flash"]
        for fb in fallbacks:
            if fb not in models_to_try:
                models_to_try.append(fb)

        last_exception = None
        for current_model in models_to_try:
            for attempt in range(3):
                try:
                    response = client_gemini.models.generate_content(
                        model=current_model,
                        contents=full_prompt
                    )
                    return response.text
                except (ServerError, ClientError, APIError) as e:
                    last_exception = e
                    err_msg = str(e)
                    # If it's a 404/NOT_FOUND error, the model identifier doesn't exist, so move to the next model immediately
                    if "404" in err_msg or "NOT_FOUND" in err_msg:
                        break
                    # For transient failures (503/429), back off and retry
                    time.sleep(2 ** attempt)
                except Exception as e:
                    last_exception = e
                    time.sleep(2 ** attempt)

        raise RuntimeError(f"Gemini API call failed after trying all fallback models. Last error: {last_exception}")

    if selected_provider == "openai":
        model_name = os.getenv("OPENAI_MODEL", "gpt-4o")
        messages = []
        if system_instruction:
            messages.append({"role": "system", "content": system_instruction})
        messages.append({"role": "user", "content": prompt})

        client = openai.OpenAI(api_key=openai_key)
        response = client.chat.completions.create(
            model=model_name,
            messages=messages,
            temperature=0.2
        )
        return response.choices[0].message.content

    raise RuntimeError(f"Unknown provider '{selected_provider}'. Use 'gemini' or 'openai'.")
