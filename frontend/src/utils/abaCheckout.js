// Builds and submits a real browser <form> POST to ABA PayWay's Purchase
// endpoint. This has to be an actual form submission (not fetch/axios)
// because ABA responds to it directly with the hosted checkout page itself
// — the browser needs to navigate there, not just receive JSON back.
export function redirectToAbaCheckout(actionUrl, fields) {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = actionUrl;
  form.enctype = "multipart/form-data";
  Object.entries(fields || {}).forEach(([name, value]) => {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value ?? "";
    form.appendChild(input);
  });
  document.body.appendChild(form);
  form.submit();
}
