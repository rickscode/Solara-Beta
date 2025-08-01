import subprocess
import json
import asyncio
import os
from pathlib import Path

class TokenAnalysisWrapper:
    """Python wrapper for the Node.js token analysis system"""
    
    def __init__(self):
        self.base_dir = Path(__file__).parent
    
    async def quick_analyze_token(self, contract_address, token_symbol=None):
        """Run quick token analysis via Node.js"""
        try:
            # Prepare the command
            cmd_parts = [
                'node',
                '-e',
                f"""
                import {{ quickAnalyzeToken }} from './quick-analysis.js';
                
                const contractAddress = '{contract_address}';
                const tokenSymbol = '{token_symbol or ''}';
                
                console.log('🚀 Starting Python wrapper analysis...');
                
                try {{
                  const result = await quickAnalyzeToken(
                    contractAddress,
                    tokenSymbol || null
                  );
                  
                  // Output as JSON for Python to parse
                  console.log('PYTHON_RESULT_START');
                  console.log(JSON.stringify(result, null, 2));
                  console.log('PYTHON_RESULT_END');
                  
                }} catch (error) {{
                  console.error('Analysis failed:', error);
                  console.log('PYTHON_ERROR_START');
                  console.log(JSON.stringify({{ error: error.message }}));
                  console.log('PYTHON_ERROR_END');
                }}
                """
            ]
            
            # Run the Node.js process
            process = await asyncio.create_subprocess_exec(
                *cmd_parts,
                cwd=self.base_dir,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            
            stdout, stderr = await process.communicate()
            
            # Parse the output
            output = stdout.decode('utf-8')
            
            # Extract JSON result
            if 'PYTHON_RESULT_START' in output:
                start_idx = output.find('PYTHON_RESULT_START') + len('PYTHON_RESULT_START\n')
                end_idx = output.find('PYTHON_RESULT_END')
                json_str = output[start_idx:end_idx].strip()
                
                try:
                    result = json.loads(json_str)
                    return result
                except json.JSONDecodeError as e:
                    return {"error": f"Failed to parse JSON result: {str(e)}"}
            
            elif 'PYTHON_ERROR_START' in output:
                start_idx = output.find('PYTHON_ERROR_START') + len('PYTHON_ERROR_START\n')
                end_idx = output.find('PYTHON_ERROR_END')
                json_str = output[start_idx:end_idx].strip()
                
                try:
                    error_result = json.loads(json_str)
                    return error_result
                except json.JSONDecodeError:
                    return {"error": "Failed to parse error result"}
            
            else:
                # No structured output found, return raw output
                stderr_output = stderr.decode('utf-8')
                return {
                    "error": "No structured output from Node.js process",
                    "stdout": output,
                    "stderr": stderr_output
                }
                
        except Exception as e:
            return {"error": f"Python wrapper failed: {str(e)}"}
    
    async def full_analyze_token(self, contract_address, token_symbol=None, dextools_url=None):
        """Run full token analysis via Node.js"""
        # This would call the full analysis system
        return {"error": "Full analysis not implemented yet"}

# Global instance
analyzer = TokenAnalysisWrapper()

# Async wrapper functions for Streamlit
async def quickAnalyzeToken(contract_address, token_symbol=None, dextools_url=None):
    """Async function compatible with Streamlit"""
    return await analyzer.quick_analyze_token(contract_address, token_symbol, dextools_url)

async def fullAnalyzeToken(contract_address, token_symbol=None, dextools_url=None):
    """Async function for full analysis"""
    return await analyzer.full_analyze_token(contract_address, token_symbol, dextools_url)