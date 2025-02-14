function sendEmail() {
    emailjs.init("WCnhUabRw2QYI15hS");

    const serviceID = "service_aqdrbt7";
    const templateID = "template_m294r78";
    const name = document.getElementById("user_name").value;
    const email = document.getElementById("user_email").value;
    const message = document.getElementById("message").value;

    emailjs.send(serviceID, templateID, {
        user_name: name,
        user_email: email,
        message: message
    })

    .then(function(response) {
        console.log('Success!', response);
        alert('Email sent successfully!');
    }, function (error) {
        console.log('Failed...', error);
        alert('Message failed to send.');
    });
}

document.getElementById('contact-form').addEventListener('submit', function (event) {
    event.preventDefault();
    sendEmail();
});


