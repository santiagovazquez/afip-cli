import { default as inquirer, DistinctQuestion } from "inquirer";

function singleQuestion(props: DistinctQuestion) {
    return inquirer.prompt([
        {
            ...props,
            name: "single",
        }
    ]).then(({ single }) => single);
}

export function askPassword(msg: string) {
    return singleQuestion({ type: "password", message: msg, mask: "*" });
}

export function askInput(msg: string) {
    return singleQuestion({ type: "input", message: msg });
}
